import { memo, useEffect, useState } from "react";
import { motion } from "motion/react";
import { Check, Copy, RefreshCw, Share2, ThumbsDown, ThumbsUp } from "lucide-react";
import { useChatActions } from "../context/ChatContext.jsx";
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
    <div className="typing" role="status" aria-label="RovaOS is working" data-testid="typing-indicator">
      <span />
      <span />
      <span />
    </div>
  );
}

function visibleBlock(block) {
  return !(block.status === "running" && (block.kind === "calendar" || block.kind === "email"));
}

// Reveal at least one word per tick, scaling up with the backlog so a long
// answer that has fully arrived finishes in a couple of seconds instead of
// crawling at a fixed word rate.
function revealNextChunk(current, target) {
  if (!target.startsWith(current)) return target;
  let next = current;
  const remainingWords = target.slice(current.length).split(/\s+/).filter(Boolean).length;
  const wordsPerTick = Math.max(1, Math.ceil(remainingWords / 30));
  for (let i = 0; i < wordsPerTick && next !== target; i += 1) {
    const match = target.slice(next.length).match(/^(\s*\S+\s*)/);
    if (!match) return target;
    next += match[1];
  }
  return next;
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
        return revealNextChunk(current, target);
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
  const { retryAssistant, setFeedback, messageTextForShare } = useChatActions();
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

// Once an approval reaches a terminal state, the assistant prose written while
// the action was pending becomes historically stale ("this has not run yet").
// The prose stays visible as context, and this line states what actually happened.
function approvalOutcomeText(block) {
  const approval = block.approval || {};
  const time = approval.resolvedAt ? ` at ${formatTime(approval.resolvedAt)}` : "";
  switch (approval.status) {
    case "succeeded":
      return `Approved action completed${time} — see the result card above.`;
    case "failed":
      return `Approved action failed${time} — see the result card above. Nothing else ran.`;
    case "cancelled":
      return `Action cancelled before execution${time}. Nothing ran.`;
    case "expired":
      return `Approval expired without execution${time}. Nothing ran.`;
    case "unavailable":
      return "This approval became unavailable after a reload. Nothing ran.";
    default:
      return null;
  }
}

// Memoized: streaming updates preserve referential identity for untouched
// messages, so only the actively-updating message re-renders per token.
export const Message = memo(function Message({ message }) {
  const isUser = message.role === "user";
  const visibleBlocks = (message.blocks || []).filter(visibleBlock);
  const approvalBlocks = visibleBlocks.filter((block) => block.approval);
  const approvalResolved =
    approvalBlocks.length > 0 &&
    approvalBlocks.every((block) => !["pending", "approving", "cancelling", "approved", "executing"].includes(block.approval.status));
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
          <ActionBlock block={block} messageId={message.id} key={block.id} />
        ))}
        {showTyping && <Typing />}
        {message.error && <ErrorNote message={message.error} />}
        {message.text && (
          <div className={cn("assistant-answer", message.status === "error" && "error", isRevealing && "revealing")} data-revealing={isRevealing ? "true" : "false"}>
            <Markdown text={revealedText} />
          </div>
        )}
        {approvalResolved && (
          <div className="execution-summary" data-testid="execution-summary" role="status">
            {approvalBlocks.map((block) => {
              const text = approvalOutcomeText(block);
              return text ? <p key={block.id}>{text}</p> : null;
            })}
          </div>
        )}
        {message.status === "stopped" && <span className="msg-flag">Stopped</span>}
        {(message.text || visibleBlocks.length > 0 || message.error) && <MessageToolbar message={message} />}
        {(message.text || visibleBlocks.length > 0 || message.error) && <time className="msg-time">{formatTime(message.time)}</time>}
      </div>
    </motion.article>
  );
});
