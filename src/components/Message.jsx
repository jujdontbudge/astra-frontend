import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Check, Copy, RefreshCw, Share2, ThumbsDown, ThumbsUp } from "lucide-react";
import { useChat } from "../context/ChatContext.jsx";
import { fadeUp, springs } from "../lib/motion.js";
import { Markdown } from "../lib/markdown.jsx";
import { cn, formatTime } from "../lib/utils.js";
import { useReducedMotionPreference } from "../lib/useReducedMotionPreference.js";
import { ActionBlock, ErrorNote } from "./AgentBlocks.jsx";

function Attachments({ items }) {
  if (!items?.length) return null;
  return (
    <div className="attachments in-bubble">
      {items.map((att) =>
        att.dataUrl ? (
          <img className="attach-thumb" src={att.dataUrl} alt={att.name} key={att.id} />
        ) : (
          <span className="attach-chip" key={att.id} title={att.name}>
            {att.name}
          </span>
        )
      )}
    </div>
  );
}

function Typing() {
  return (
    <div className="typing" role="status" aria-label="Astra is working" data-testid="typing-indicator">
      <span />
      <span />
      <span />
    </div>
  );
}

function visibleBlock(block) {
  return !(block.status === "running" && (block.kind === "calendar" || block.kind === "email"));
}

function revealNextWord(current, target) {
  if (!target.startsWith(current)) return target;
  const remaining = target.slice(current.length);
  const match = remaining.match(/^(\s*\S+\s*)/);
  return match ? current + match[1] : target;
}

function useRevealedText(message, enabled) {
  const reduced = useReducedMotionPreference();
  const target = message.text || "";
  // Only run the typewriter for a message that mounted empty (i.e. is streaming in
  // right now). Restored/persisted messages already have their text and must not replay.
  const [mountedEmpty] = useState(() => !(message.text || "").length);
  const shouldReveal = enabled && mountedEmpty && target.length > 0 && !reduced;
  const [shown, setShown] = useState(() => (shouldReveal ? "" : target));

  useEffect(() => {
    setShown(shouldReveal ? "" : target);
  }, [message.id, shouldReveal]);

  useEffect(() => {
    if (!shouldReveal) {
      setShown(target);
      return undefined;
    }

    const interval = window.setInterval(() => {
      setShown((current) => {
        if (current === target) {
          window.clearInterval(interval);
          return current;
        }
        return revealNextWord(current, target);
      });
    }, 62);

    return () => window.clearInterval(interval);
  }, [target, shouldReveal]);

  return shouldReveal ? shown : target;
}

async function copyText(text) {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

function MessageToolbar({ message }) {
  const { retryAssistant, setFeedback, messageTextForShare } = useChat();
  const [copied, setCopied] = useState(null);
  const shareText = messageTextForShare(message);

  async function flash(kind, text) {
    const ok = await copyText(text);
    if (!ok) return;
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1200);
  }

  return (
    <div className="msg-toolbar" aria-label="Message actions">
      <button type="button" onClick={() => flash("copy", message.text)} aria-label="Copy answer">
        {copied === "copy" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        <span>{copied === "copy" ? "Copied" : "Copy"}</span>
      </button>
      <button type="button" onClick={() => retryAssistant(message.id)} aria-label="Retry answer">
        <RefreshCw aria-hidden="true" />
        <span>Retry</span>
      </button>
      <button type="button" onClick={() => flash("share", shareText)} aria-label="Share answer">
        {copied === "share" ? <Check aria-hidden="true" /> : <Share2 aria-hidden="true" />}
        <span>{copied === "share" ? "Copied" : "Share"}</span>
      </button>
      <button
        type="button"
        className={cn(message.feedback === "up" && "active")}
        onClick={() => setFeedback(message.id, "up")}
        aria-label="Positive feedback"
      >
        <ThumbsUp aria-hidden="true" />
      </button>
      <button
        type="button"
        className={cn(message.feedback === "down" && "active")}
        onClick={() => setFeedback(message.id, "down")}
        aria-label="Negative feedback"
      >
        <ThumbsDown aria-hidden="true" />
      </button>
    </div>
  );
}

export function Message({ message }) {
  const isUser = message.role === "user";
  const visibleBlocks = (message.blocks || []).filter(visibleBlock);
  const revealedText = useRevealedText(message, !isUser && message.status !== "error");
  const isRevealing = !isUser && revealedText !== (message.text || "");
  const showTyping =
    !isUser &&
    !message.text &&
    !message.error &&
    (message.status === "thinking" || message.status === "working" || message.status === "streaming") &&
    visibleBlocks.length === 0;

  if (isUser) {
    return (
      <motion.article className="msg user" variants={fadeUp} initial="hidden" animate="show" transition={springs.soft} data-testid="user-message">
        <div className="msg-body">
          <div className="bubble user">
            <Attachments items={message.attachments} />
            <p className="bubble-text">{message.text}</p>
          </div>
          <time className="msg-time">{formatTime(message.time)}</time>
        </div>
      </motion.article>
    );
  }

  return (
    <motion.article className="msg assistant" variants={fadeUp} initial="hidden" animate="show" transition={springs.soft} data-testid="assistant-message">
      <div className="msg-body">
        {visibleBlocks.map((block) => (
          <ActionBlock block={block} key={block.id} />
        ))}
        {showTyping && <Typing />}
        {message.error && <ErrorNote message={message.error} />}
        {message.text && (
          <div className={cn("assistant-answer", message.status === "error" && "error", isRevealing && "revealing")} data-revealing={isRevealing ? "true" : "false"}>
            <Markdown text={revealedText} />
          </div>
        )}
        {message.status === "stopped" && <span className="msg-flag">Stopped</span>}
        {(message.text || visibleBlocks.length > 0 || message.error) && <MessageToolbar message={message} />}
        {(message.text || visibleBlocks.length > 0 || message.error) && <time className="msg-time">{formatTime(message.time)}</time>}
      </div>
    </motion.article>
  );
}
