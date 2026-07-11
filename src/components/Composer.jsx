import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, AudioLines, Paperclip, Sparkles, Square } from "lucide-react";
import { useChat } from "../context/ChatContext.jsx";
import { useSettings } from "../context/SettingsContext.jsx";
import { springs } from "../lib/motion.js";

export function Composer({ disabled = false, onDisabledClick, placement = "home" }) {
  const { send, stop, isStreaming } = useChat();
  const { settings } = useSettings();
  const backendLabel = settings.backend === "jarvis" ? "RovaOS" : "Anthropic";
  const [text, setText] = useState("");
  const attachmentNoteId = useId();
  const textareaRef = useRef(null);
  const wrapRef = useRef(null);
  const prevComposerH = useRef(0);

  useLayoutEffect(() => {
    // Measure the whole docked stack (suggestion chips + composer) so the
    // jump-to-latest pill clears everything anchored above the input.
    const el = wrapRef.current?.closest(".docked-composer") || wrapRef.current;
    if (!el) return;
    const h = el.offsetHeight;
    document.documentElement.style.setProperty("--composer-h", `${h}px`);
    const flow = document.querySelector(".flow");
    if (flow) {
      const delta = h - prevComposerH.current;
      const distanceBefore = flow.scrollHeight - flow.scrollTop - flow.clientHeight - delta;
      if (distanceBefore < 120) {
        const prev = flow.style.scrollBehavior;
        flow.style.scrollBehavior = "auto";
        flow.scrollTop = flow.scrollHeight;
        flow.style.scrollBehavior = prev;
      }
    }
    prevComposerH.current = h;
  }, [text, placement]);

  useEffect(() => {
    const el = wrapRef.current?.closest(".docked-composer") || wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const apply = () => document.documentElement.style.setProperty("--composer-h", `${el.offsetHeight}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function autosize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  function submit() {
    const value = text.trim();
    if (!value || isStreaming || disabled) return;
    send(value);
    setText("");
    requestAnimationFrame(autosize);
  }

  function onKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  const canSend = text.trim().length > 0 && !isStreaming && !disabled;

  return (
    <motion.div
      className={`composer-wrap composer-${placement}`}
      ref={wrapRef}
      transition={springs.panel}
      data-testid="composer-wrap"
    >
      <form
        className={disabled ? "composer disabled" : "composer"}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        onClick={disabled ? onDisabledClick : undefined}
      >
        <div className="composer-controls">
          <button
            type="button"
            className="icon-round attach-btn unavailable"
            aria-label="File attachments unavailable"
            aria-describedby={attachmentNoteId}
            title="Files are not sent by this build"
            disabled
          >
            <Paperclip aria-hidden="true" />
          </button>
          <span className="mode-pill">
            <Sparkles aria-hidden="true" />
            <span>{backendLabel}</span>
          </span>
        </div>

        <textarea
          ref={textareaRef}
          className="composer-input"
          placeholder={disabled ? "Open Settings to connect RovaOS" : "Ask RovaOS anything…"}
          rows={1}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            autosize();
          }}
          onKeyDown={onKeyDown}
          aria-label="Ask RovaOS anything"
          readOnly={disabled}
          data-testid="composer-input"
        />

        <div className="composer-action-slot">
          <AnimatePresence mode="wait" initial={false}>
            {isStreaming ? (
              <motion.button
                key="stop"
                type="button"
                className="send stop"
                aria-label="Stop generating"
                onClick={stop}
                initial={{ opacity: 0, scale: 0.84 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.84 }}
                transition={springs.quick}
                data-testid="stop-button"
              >
                <Square aria-hidden="true" />
              </motion.button>
            ) : canSend ? (
              <motion.button
                key="send"
                type="submit"
                className="send"
                aria-label="Send message"
                initial={{ opacity: 0, scale: 0.72, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.72, y: 4 }}
                transition={springs.quick}
                data-testid="send-button"
              >
                <span>Send</span>
                <ArrowUp aria-hidden="true" />
              </motion.button>
            ) : (
              <motion.span
                key="idle"
                className="idle-voice"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={springs.quick}
                aria-hidden="true"
              >
                <AudioLines />
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </form>
      <p className="attachment-notice" id={attachmentNoteId}>
        File uploads are unavailable; only your typed message is sent.
      </p>
    </motion.div>
  );
}
