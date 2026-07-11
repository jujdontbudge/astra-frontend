import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { decideJarvisAction, forgetApprovalSecrets } from "../agent/jarvis.js";
import { runAgent } from "../agent/runAgent.js";
import { classifyTool, galleryBlocks, isFailure, safeErrorMessage } from "../lib/tooling.js";
import { approvalExpiryMs } from "../lib/approval.js";
import { parseMaybeJSON, safeJSONParse, safeStorageGet, safeStorageSet, truncate, uid } from "../lib/utils.js";
import { useSettings } from "./SettingsContext.jsx";

const STORAGE_KEY = "rovaos.chat.v2";
const ChatContext = createContext(null);
// Actions never change identity, so components that only dispatch (message
// toolbars, approval buttons) can subscribe here and skip per-token re-renders.
const ChatActionsContext = createContext(null);

function blankConversation(title = "New chat") {
  const ts = Date.now();
  return { id: uid("conv"), title, titleSet: title !== "New chat", createdAt: ts, updatedAt: ts, messages: [] };
}

function userMessage(text) {
  return {
    id: uid("user"),
    role: "user",
    text,
    attachments: [],
    status: "done",
    blocks: [],
    error: null,
    feedback: null,
    time: Date.now(),
  };
}

function assistantPlaceholder() {
  return {
    id: uid("rovaos"),
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
  const parsed = parseMaybeJSON(ev.output);
  const payloadMissing =
    ev.output == null ||
    (typeof ev.output === "string" && !ev.output.trim()) ||
    parsed == null ||
    (typeof parsed === "object" && !Array.isArray(parsed) && Object.keys(parsed).length === 0);
  const result = payloadMissing ? { error: "No result was returned for this tool call." } : parsed;
  const failed = payloadMissing || isFailure(result);
  return {
    ...block,
    kind: classifyTool(ev.tool || block.tool),
    tool: ev.tool || block.tool,
    result,
    rawOutput: ev.output,
    status: failed ? "error" : "done",
  };
}

function isApprovalPendingResult(value) {
  return Boolean(value && typeof value === "object" && value.status === "approval_required");
}

function upsertCall(blocks, ev) {
  const next = normalizeBlockFromCall(ev);
  const idx = blocks.findIndex((block) => block.id === next.id);
  if (idx === -1) return [...blocks, next];
  return blocks.map((block) => (block.id === next.id ? { ...block, ...next, result: block.result } : block));
}

function upsertResult(blocks, ev) {
  const parsed = parseMaybeJSON(ev.output);
  const idx = blocks.findIndex((block) => block.id === ev.id);
  if (idx === -1) {
    if (isApprovalPendingResult(parsed)) {
      return [
        ...blocks,
        {
          id: ev.id || uid("tool"),
          kind: classifyTool(ev.tool),
          tool: ev.tool,
          input: {},
          result: { error: "Approval details were not received for this action." },
          rawOutput: ev.output,
          status: "error",
        },
      ];
    }
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
  return blocks.map((block) => {
    if (block.id !== ev.id) return block;
    if (isApprovalPendingResult(parsed)) {
      if (!block.approval) {
        return {
          ...block,
          status: "error",
          result: { error: "Approval details were not received for this action." },
          rawOutput: ev.output,
        };
      }
      return { ...block, status: "approval_required", result: parsed, rawOutput: ev.output };
    }
    return completeBlock(block, ev);
  });
}

function approvalBlockIndex(blocks, ev) {
  return blocks.findIndex(
    (block) =>
      (ev.id && block.id === ev.id) ||
      (ev.actionId && block.approval?.actionId === ev.actionId)
  );
}

function upsertApproval(blocks, ev) {
  const idx = approvalBlockIndex(blocks, ev);
  const approval = {
    actionId: ev.actionId,
    effect: ev.effect || "This action changes data in a connected service.",
    expiresAt: ev.expiresAt || null,
    message: ev.message || "Review the exact arguments before deciding.",
    status: "pending",
    error: null,
  };
  if (idx === -1) {
    return [
      ...blocks,
      {
        ...normalizeBlockFromCall(ev),
        input: ev.input || {},
        status: "approval_required",
        approval,
      },
    ];
  }
  return blocks.map((block, blockIndex) =>
    blockIndex === idx
      ? {
          ...block,
          kind: classifyTool(ev.tool || block.tool),
          tool: ev.tool || block.tool,
          input: ev.input || block.input || {},
          result: null,
          rawOutput: null,
          status: "approval_required",
          approval,
        }
      : block
  );
}

function updateActionState(blocks, ev) {
  const idx = approvalBlockIndex(blocks, ev);
  if (idx === -1) return blocks;
  const approvalStatus = ev.status || "executing";
  return blocks.map((block, blockIndex) => {
    if (blockIndex !== idx) return block;
    const cancelled = approvalStatus === "cancelled";
    const failed = approvalStatus === "failed";
    return {
      ...block,
      status: cancelled ? "cancelled" : failed ? "error" : "executing",
      result: cancelled ? { status: "cancelled", message: "Action cancelled before execution." } : block.result,
      approval: {
        ...block.approval,
        status: approvalStatus,
        error: failed ? "The connected action failed." : null,
        resolvedAt: cancelled || failed ? Date.now() : block.approval?.resolvedAt || null,
      },
    };
  });
}

function upsertActionResult(blocks, ev) {
  const idx = approvalBlockIndex(blocks, ev);
  if (idx === -1) return blocks;
  return blocks.map((block, blockIndex) => {
    if (blockIndex !== idx) return block;
    let completed = completeBlock(block, ev);
    if (ev.status && ev.status !== "succeeded" && completed.status === "done") {
      const parsed = completed.result && typeof completed.result === "object" ? completed.result : { output: completed.result };
      completed = {
        ...completed,
        status: "error",
        result: { ...parsed, error: "The backend did not confirm this action as successful." },
      };
    }
    return {
      ...completed,
      approval: {
        ...block.approval,
        status: completed.status === "done" ? "succeeded" : "failed",
        error: completed.status === "done" ? null : safeErrorMessage(completed.result?.error),
        resolvedAt: Date.now(),
      },
    };
  });
}

function upsertActionError(blocks, ev) {
  const idx = approvalBlockIndex(blocks, ev);
  if (idx === -1) return blocks;
  const status = ev.code === "action_expired" ? "expired" : "failed";
  return blocks.map((block, blockIndex) =>
    blockIndex === idx
      ? {
          ...block,
          status: "error",
          result: { error: ev.message || "The action could not be completed.", code: ev.code || "action_failed" },
          approval: {
            ...block.approval,
            status,
            error: ev.message || "The action could not be completed.",
            resolvedAt: Date.now(),
          },
        }
      : block
  );
}

function finishRunningBlocks(blocks) {
  return blocks.map((block) => {
    if (block.status !== "running") return block;
    // A final answer is not evidence that a preceding tool call completed. Every
    // call must receive its own correlated tool_result before the UI can show it
    // as successful, including generic tools that used to be auto-marked "done".
    return {
      ...block,
      status: "error",
      result: block.result || { error: "No result was returned before the response completed." },
    };
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
    case "approval_required":
      return { ...msg, status: "working", blocks: upsertApproval(msg.blocks, ev) };
    case "action_state":
      return { ...msg, blocks: updateActionState(msg.blocks, ev) };
    case "action_result":
      return { ...msg, blocks: upsertActionResult(msg.blocks, ev) };
    case "action_error":
      return { ...msg, blocks: upsertActionError(msg.blocks, ev) };
    case "error":
      return { ...msg, status: "error", error: ev.message || "Something went wrong.", blocks: finishRunningBlocks(msg.blocks) };
    case "feedback":
      return { ...msg, feedback: msg.feedback === ev.value ? null : ev.value };
    default:
      return msg;
  }
}

const OPEN_APPROVAL_STATUSES = ["pending", "approving", "cancelling", "approved", "executing"];

// A reloaded page can never redeem an approval token: the plaintext secret only
// exists in the pre-reload in-memory vault. Every still-open approval must be
// neutralized regardless of the status the surrounding message was saved with.
function healApprovalBlocks(blocks) {
  return (blocks || []).map((block) => {
    if (!block.approval || !OPEN_APPROVAL_STATUSES.includes(block.approval.status)) {
      return block;
    }
    const message = "This approval is no longer available after a reload. Request the action again.";
    return {
      ...block,
      status: "error",
      result: { error: message, code: "approval_unavailable" },
      approval: { ...block.approval, status: "unavailable", error: message, resolvedAt: Date.now() },
    };
  });
}

function healConversation(c) {
  const messages = Array.isArray(c?.messages) ? c.messages.filter((m) => m && typeof m === "object") : [];
  return {
    ...c,
    messages: messages.map((m) => {
      if (m.role !== "assistant") return m;
      if (m.status === "thinking" || m.status === "working" || m.status === "streaming") {
        return {
          ...m,
          status: m.text || m.blocks?.length ? "done" : "stopped",
          blocks: healApprovalBlocks(finishRunningBlocks(m.blocks || [])),
        };
      }
      return {
        ...m,
        blocks: healApprovalBlocks(m.blocks || []),
        error: m.error || null,
      };
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
  const actionLocksRef = useRef(new Set());
  const actionControllersRef = useRef(new Map());
  // Mirror volatile state into refs so action callbacks can stay
  // identity-stable across streaming updates (same pattern as settingsRef).
  const stateRef = useRef({ conversations, activeId });
  stateRef.current = { conversations, activeId };
  const sendLockRef = useRef(false);

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

  const decideApproval = useCallback(
    async (messageId, blockId, decision) => {
      const { conversations: currentConversations, activeId } = stateRef.current;
      if (!activeId || (decision !== "approve" && decision !== "cancel")) return;
      const conversation = currentConversations.find((item) => item.id === activeId);
      const message = conversation?.messages.find((item) => item.id === messageId);
      const block = message?.blocks?.find((item) => item.id === blockId);
      const actionId = block?.approval?.actionId;
      if (!actionId || actionLocksRef.current.has(actionId)) return;

      actionLocksRef.current.add(actionId);
      applyEvent(activeId, messageId, {
        type: "action_state",
        id: blockId,
        actionId,
        tool: block.tool,
        status: decision === "approve" ? "approving" : "cancelling",
      });

      const controller = new AbortController();
      actionControllersRef.current.set(actionId, { convId: activeId, controller });
      try {
        const current = settingsRef.current;
        if (current?.backend !== "jarvis") throw new Error("Structured approvals require the local RovaOS backend.");
        const expiresAt = approvalExpiryMs(block.approval.expiresAt);
        if (expiresAt && expiresAt <= Date.now()) {
          const expired = new Error("This approval request has expired. Request the action again.");
          expired.code = "action_expired";
          throw expired;
        }
        await decideJarvisAction({
          baseUrl: current.jarvisUrl,
          sessionId: activeId,
          actionId,
          decision,
          signal: controller.signal,
          onEvent: (event) => applyEvent(activeId, messageId, event),
        });
      } catch (error) {
        if (!error?.reported) {
          applyEvent(activeId, messageId, {
            type: "action_error",
            id: blockId,
            actionId,
            tool: block.tool,
            code: error?.code || "action_failed",
            message: error?.name === "AbortError" ? "The approval request was interrupted." : error?.message,
          });
        }
      } finally {
        actionControllersRef.current.delete(actionId);
      }
    },
    [applyEvent]
  );

  const send = useCallback(
    async (rawText) => {
      const text = (rawText || "").trim();
      // Ref lock instead of state: two Enter presses in the same tick both see
      // stale isStreaming, but the ref flips synchronously.
      if (!text || sendLockRef.current) return;
      sendLockRef.current = true;

      const current = settingsRef.current;
      const { conversations: currentConversations, activeId } = stateRef.current;
      const existing = currentConversations.find((c) => c.id === activeId);
      const conv = existing || blankConversation();
      const convId = conv.id;
      const priorMessages = conv.messages;
      const userMsg = userMessage(text);
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
        sendLockRef.current = false;
        setIsStreaming(false);
      }
    },
    [applyEvent]
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
      forgetApprovalSecrets(id);
      for (const [actionId, pending] of actionControllersRef.current) {
        if (pending.convId !== id) continue;
        pending.controller.abort();
        actionControllersRef.current.delete(actionId);
      }
      setState((prev) => ({
        activeId: prev.activeId === id ? null : prev.activeId,
        conversations: prev.conversations.filter((c) => c.id !== id),
      }));
    },
    [stop]
  );

  const clearAll = useCallback(() => {
    stop();
    for (const conversation of stateRef.current.conversations) forgetApprovalSecrets(conversation.id);
    for (const pending of actionControllersRef.current.values()) pending.controller.abort();
    actionControllersRef.current.clear();
    setState({ conversations: [], activeId: null });
  }, [stop]);

  const setFeedback = useCallback(
    (messageId, value) => {
      const { activeId } = stateRef.current;
      if (!activeId) return;
      applyEvent(activeId, messageId, { type: "feedback", value });
    },
    [applyEvent]
  );

  const retryAssistant = useCallback(
    (messageId) => {
      const { conversations: currentConversations, activeId } = stateRef.current;
      const conv = currentConversations.find((c) => c.id === activeId);
      if (!conv) return;
      const idx = conv.messages.findIndex((m) => m.id === messageId);
      const previousUser = [...conv.messages.slice(0, idx)].reverse().find((m) => m.role === "user");
      if (previousUser) send(previousUser.text);
    },
    [send]
  );

  const injectDemoAction = useCallback(() => {
    const { conversations: currentConversations, activeId } = stateRef.current;
    const conv = currentConversations.find((c) => c.id === activeId) || blankConversation("Preview booking");
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
  }, []);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) || null,
    [conversations, activeId]
  );

  const actions = useMemo(
    () => ({
      send,
      stop,
      newChat,
      selectChat,
      renameChat,
      deleteChat,
      clearAll,
      setFeedback,
      retryAssistant,
      decideApproval,
      injectDemoAction,
      messageTextForShare,
    }),
    [
      send,
      stop,
      newChat,
      selectChat,
      renameChat,
      deleteChat,
      clearAll,
      setFeedback,
      retryAssistant,
      decideApproval,
      injectDemoAction,
    ]
  );

  const value = useMemo(
    () => ({
      conversations,
      activeId,
      activeConversation,
      messages: activeConversation?.messages || [],
      isStreaming,
      ...actions,
    }),
    [conversations, activeId, activeConversation, isStreaming, actions]
  );

  return (
    <ChatActionsContext.Provider value={actions}>
      <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
    </ChatActionsContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}

export function useChatActions() {
  const ctx = useContext(ChatActionsContext);
  if (!ctx) throw new Error("useChatActions must be used within ChatProvider");
  return ctx;
}
