import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { runAgent } from "../agent/runAgent.js";
import { classifyTool, galleryBlocks } from "../lib/tooling.js";
import { parseMaybeJSON, safeJSONParse, safeStorageGet, safeStorageSet, truncate, uid } from "../lib/utils.js";
import { useSettings } from "./SettingsContext.jsx";

const STORAGE_KEY = "astra.chat.v2";
const ChatContext = createContext(null);

function blankConversation(title = "New chat") {
  const ts = Date.now();
  return { id: uid("conv"), title, titleSet: title !== "New chat", createdAt: ts, updatedAt: ts, messages: [] };
}

function userMessage(text, attachments) {
  return {
    id: uid("user"),
    role: "user",
    text,
    attachments: attachments || [],
    status: "done",
    blocks: [],
    error: null,
    feedback: null,
    time: Date.now(),
  };
}

function assistantPlaceholder() {
  return {
    id: uid("astra"),
    role: "assistant",
    text: "",
    attachments: [],
    blocks: [],
    status: "thinking",
    error: null,
    feedback: null,
    time: Date.now(),
  };
}

function normalizeBlockFromCall(ev) {
  return {
    id: ev.id || uid("tool"),
    kind: classifyTool(ev.tool),
    tool: ev.tool,
    input: ev.input || {},
    result: null,
    rawOutput: null,
    status: "running",
    demo: Boolean(ev.demo),
  };
}

function completeBlock(block, ev) {
  const result = parseMaybeJSON(ev.output);
  const failed = Boolean(result?.error || result?.ok === false);
  return {
    ...block,
    kind: classifyTool(ev.tool || block.tool),
    tool: ev.tool || block.tool,
    result,
    rawOutput: ev.output,
    status: failed ? "error" : "done",
  };
}

function upsertCall(blocks, ev) {
  const next = normalizeBlockFromCall(ev);
  const idx = blocks.findIndex((block) => block.id === next.id);
  if (idx === -1) return [...blocks, next];
  return blocks.map((block) => (block.id === next.id ? { ...block, ...next, result: block.result } : block));
}

function upsertResult(blocks, ev) {
  const idx = blocks.findIndex((block) => block.id === ev.id);
  if (idx === -1) {
    return [
      ...blocks,
      completeBlock(
        {
          id: ev.id || uid("tool"),
          kind: classifyTool(ev.tool),
          tool: ev.tool,
          input: {},
          result: null,
          rawOutput: null,
          status: "running",
        },
        ev
      ),
    ];
  }
  return blocks.map((block) => (block.id === ev.id ? completeBlock(block, ev) : block));
}

function finishRunningBlocks(blocks) {
  return blocks.map((block) => {
    if (block.status !== "running") return block;
    if (block.kind === "tool") {
      return { ...block, status: "done", result: block.result || { status: "done" } };
    }
    // Calendar/email actions that never received a result would otherwise stay
    // hidden forever (ActionBlock renders nothing while they're "running"). Resolve
    // them to an honest "unconfirmed" state so the card appears as a failure.
    return { ...block, status: "error", result: block.result || { error: "Interrupted before confirmation" } };
  });
}

function reduceMessage(msg, ev) {
  switch (ev.type) {
    case "status":
      return {
        ...msg,
        status: ev.value,
        blocks: ev.value === "done" || ev.value === "stopped" ? finishRunningBlocks(msg.blocks) : msg.blocks,
      };
    case "text":
      return { ...msg, text: msg.text + ev.value, status: msg.status === "thinking" ? "streaming" : msg.status };
    case "tool_call":
      return { ...msg, status: "working", blocks: upsertCall(msg.blocks, ev) };
    case "tool_result":
      return { ...msg, status: msg.status === "thinking" ? "working" : msg.status, blocks: upsertResult(msg.blocks, ev) };
    case "error":
      return { ...msg, status: "error", error: ev.message || "Something went wrong.", blocks: finishRunningBlocks(msg.blocks) };
    case "feedback":
      return { ...msg, feedback: msg.feedback === ev.value ? null : ev.value };
    default:
      return msg;
  }
}

function healConversation(c) {
  const messages = Array.isArray(c?.messages) ? c.messages.filter((m) => m && typeof m === "object") : [];
  return {
    ...c,
    messages: messages.map((m) => {
      if (m.role !== "assistant") return m;
      if (m.status === "thinking" || m.status === "working" || m.status === "streaming") {
        return { ...m, status: m.text || m.blocks?.length ? "done" : "stopped", blocks: finishRunningBlocks(m.blocks || []) };
      }
      return { ...m, blocks: m.blocks || [], error: m.error || null };
    }),
  };
}

function load() {
  try {
    const data = safeJSONParse(safeStorageGet(STORAGE_KEY), { conversations: [], activeId: null });
    const list = Array.isArray(data?.conversations) ? data.conversations : [];
    return {
      conversations: list.filter((c) => c && typeof c === "object").map(healConversation),
      activeId: data?.activeId || null,
    };
  } catch {
    return { conversations: [], activeId: null };
  }
}

function messageTextForShare(message) {
  const blocks = (message.blocks || []).map((block) => `${block.tool}: ${block.status}`).join("\n");
  return [message.text, blocks, message.error].filter(Boolean).join("\n\n");
}

export function ChatProvider({ children }) {
  const { settings } = useSettings();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const [{ conversations, activeId }, setState] = useState(load);
  const [isStreaming, setIsStreaming] = useState(false);
  const streamingConvId = useRef(null);
  const abortRef = useRef(null);

  const setConversations = useCallback((updater) => {
    setState((prev) => ({ ...prev, conversations: typeof updater === "function" ? updater(prev.conversations) : updater }));
  }, []);

  const setActiveId = useCallback((id) => setState((prev) => ({ ...prev, activeId: id })), []);

  useEffect(() => {
    const t = setTimeout(() => {
      // Strip embedded image data URLs before persisting: a couple of photos can
      // exceed the ~5MB localStorage quota and wipe out all chat history.
      const slim = conversations.map((c) => ({
        ...c,
        messages: (c.messages || []).map((m) =>
          m.attachments?.length
            ? { ...m, attachments: m.attachments.map(({ dataUrl, ...rest }) => rest) }
            : m
        ),
      }));
      safeStorageSet(STORAGE_KEY, JSON.stringify({ conversations: slim, activeId }));
    }, 250);
    return () => clearTimeout(t);
  }, [conversations, activeId]);

  const applyEvent = useCallback(
    (convId, msgId, ev) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id !== convId
            ? c
            : {
                ...c,
                updatedAt: Date.now(),
                messages: c.messages.map((m) => (m.id === msgId ? reduceMessage(m, ev) : m)),
              }
        )
      );
    },
    [setConversations]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const send = useCallback(
    async (rawText, attachments = []) => {
      const text = (rawText || "").trim();
      if (!text || isStreaming) return;

      const current = settingsRef.current;
      const existing = conversations.find((c) => c.id === activeId);
      const conv = existing || blankConversation();
      const convId = conv.id;
      const priorMessages = conv.messages;
      const userMsg = userMessage(text, attachments);
      const assistantMsg = assistantPlaceholder();
      const assistantId = assistantMsg.id;

      setState((prev) => {
        const exists = prev.conversations.some((c) => c.id === convId);
        const base = exists ? prev.conversations : [conv, ...prev.conversations];
        return {
          activeId: convId,
          conversations: base.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  title: c.titleSet ? c.title : truncate(text, 42),
                  titleSet: true,
                  updatedAt: Date.now(),
                  messages: [...c.messages, userMsg, assistantMsg],
                }
              : c
          ),
        };
      });

      const controller = new AbortController();
      abortRef.current = controller;
      streamingConvId.current = convId;
      setIsStreaming(true);

      try {
        await runAgent({
          settings: current,
          text,
          mode: current.mode,
          history: [...priorMessages, userMsg],
          sessionId: convId,
          signal: controller.signal,
          onEvent: (ev) => applyEvent(convId, assistantId, ev),
        });
        applyEvent(convId, assistantId, { type: "status", value: "done" });
      } catch (err) {
        if (err?.name === "AbortError" || controller.signal.aborted) {
          applyEvent(convId, assistantId, { type: "status", value: "stopped" });
        } else {
          applyEvent(convId, assistantId, { type: "error", message: err?.message || "Something went wrong." });
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        streamingConvId.current = null;
        setIsStreaming(false);
      }
    },
    [activeId, conversations, isStreaming, applyEvent]
  );

  const newChat = useCallback(() => {
    stop();
    setActiveId(null);
  }, [setActiveId, stop]);

  const selectChat = useCallback((id) => setActiveId(id), [setActiveId]);

  const renameChat = useCallback(
    (id, title) => {
      const clean = (title || "").trim();
      if (!clean) return;
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title: clean, titleSet: true } : c)));
    },
    [setConversations]
  );

  const deleteChat = useCallback(
    (id) => {
      if (streamingConvId.current === id) stop();
      setState((prev) => ({
        activeId: prev.activeId === id ? null : prev.activeId,
        conversations: prev.conversations.filter((c) => c.id !== id),
      }));
    },
    [stop]
  );

  const clearAll = useCallback(() => {
    stop();
    setState({ conversations: [], activeId: null });
  }, [stop]);

  const setFeedback = useCallback(
    (messageId, value) => {
      if (!activeId) return;
      applyEvent(activeId, messageId, { type: "feedback", value });
    },
    [activeId, applyEvent]
  );

  const retryAssistant = useCallback(
    (messageId) => {
      const conv = conversations.find((c) => c.id === activeId);
      if (!conv) return;
      const idx = conv.messages.findIndex((m) => m.id === messageId);
      const previousUser = [...conv.messages.slice(0, idx)].reverse().find((m) => m.role === "user");
      if (previousUser) send(previousUser.text, previousUser.attachments || []);
    },
    [activeId, conversations, send]
  );

  const injectDemoAction = useCallback(() => {
    const conv = conversations.find((c) => c.id === activeId) || blankConversation("Preview booking");
    const convId = conv.id;
    const assistantMsg = {
      ...assistantPlaceholder(),
      id: uid("preview"),
      status: "done",
      text: "The planning sync is booked, and the confirmation email has been sent.",
      blocks: [
        { ...galleryBlocks.calendar, id: uid("calendar") },
        { ...galleryBlocks.email, id: uid("email") },
        { ...galleryBlocks.toolDone, id: uid("tool") },
      ],
    };

    setState((prev) => {
      const exists = prev.conversations.some((c) => c.id === convId);
      const base = exists ? prev.conversations : [conv, ...prev.conversations];
      return {
        activeId: convId,
        conversations: base.map((c) =>
          c.id === convId
            ? {
                ...c,
                title: c.titleSet ? c.title : "Preview booking",
                titleSet: true,
                updatedAt: Date.now(),
                messages: [...c.messages, assistantMsg],
              }
            : c
        ),
      };
    });
  }, [activeId, conversations]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) || null,
    [conversations, activeId]
  );

  const value = useMemo(
    () => ({
      conversations,
      activeId,
      activeConversation,
      messages: activeConversation?.messages || [],
      isStreaming,
      send,
      stop,
      newChat,
      selectChat,
      renameChat,
      deleteChat,
      clearAll,
      setFeedback,
      retryAssistant,
      injectDemoAction,
      messageTextForShare,
    }),
    [
      conversations,
      activeId,
      activeConversation,
      isStreaming,
      send,
      stop,
      newChat,
      selectChat,
      renameChat,
      deleteChat,
      clearAll,
      setFeedback,
      retryAssistant,
      injectDemoAction,
    ]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
