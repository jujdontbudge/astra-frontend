import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, AudioLines, Paperclip, Sparkles, Square, X } from "lucide-react";
import { useChat } from "../context/ChatContext.jsx";
import { useSettings } from "../context/SettingsContext.jsx";
import { springs } from "../lib/motion.js";
import { uid } from "../lib/utils.js";

const MAX_EMBED = 1.5 * 1024 * 1024;

function readAsDataUrl(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function AttachmentChip({ att, onRemove }) {
  return (
    <motion.span className="attach-chip" layout initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
      {att.dataUrl && <img className="attach-chip-thumb" src={att.dataUrl} alt="" />}
      <span className="attach-name">{att.name}</span>
      <button type="button" className="attach-remove" onClick={() => onRemove(att.id)} aria-label={`Remove ${att.name}`}>
        <X aria-hidden="true" />
      </button>
    </motion.span>
  );
}

export function Composer({ disabled = false, onDisabledClick, placement = "home" }) {
  const { send, stop, isStreaming } = useChat();
  const { settings } = useSettings();
  const backendLabel = settings.backend === "jarvis" ? "RovaOS" : "Anthropic";
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState([]);
  const textareaRef = useRef(null);
  const fileRef = useRef(null);
  const wrapRef = useRef(null);
  const prevComposerH = useRef(0);

  useLayoutEffect(() => {
    const el = wrapRef.current;
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
  }, [text, attachments, placement]);

  useEffect(() => {
    const el = wrapRef.current;
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
    send(value, attachments);
    setText("");
    setAttachments([]);
    requestAnimationFrame(autosize);
  }

  function onKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  async function onFiles(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    const next = await Promise.all(
      files.map(async (file) => {
        const isImage = file.type.startsWith("image/");
        const dataUrl = isImage && file.size <= MAX_EMBED ? await readAsDataUrl(file) : null;
        return { id: uid("att"), name: file.name, type: file.type, dataUrl };
      })
    );
    setAttachments((prev) => [...prev, ...next]);
  }

  function removeAttachment(id) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  const canSend = text.trim().length > 0 && !isStreaming && !disabled;

  return (
    <motion.div
      className={`composer-wrap composer-${placement}`}
      ref={wrapRef}
      transition={springs.panel}
      data-testid="composer-wrap"
    >
      <AnimatePresence>
        {attachments.length > 0 && !disabled && (
          <motion.div className="attachments" layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
            {attachments.map((att) => (
              <AttachmentChip att={att} key={att.id} onRemove={removeAttachment} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

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
            className="icon-round attach-btn"
            aria-label="Attach files"
            onClick={() => fileRef.current?.click()}
            disabled={disabled}
          >
            <Paperclip aria-hidden="true" />
          </button>
          <span className="mode-pill">
            <Sparkles aria-hidden="true" />
            <span>{backendLabel}</span>
          </span>
        </div>
        <input ref={fileRef} type="file" accept="image/*,.pdf,.txt,.md,.json,.csv" multiple hidden onChange={onFiles} />

        <textarea
          ref={textareaRef}
          className="composer-input"
          placeholder={disabled ? "Open Settings to connect Astra" : "Ask Astra anything…"}
          rows={1}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            autosize();
          }}
          onKeyDown={onKeyDown}
          aria-label="Ask Astra anything"
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
    </motion.div>
  );
}
