import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, Eye, EyeOff, KeyRound, Plug, Sparkles, Trash2, X, XCircle } from "lucide-react";
import { checkJarvisHealth } from "../agent/jarvis.js";
import { useChat } from "../context/ChatContext.jsx";
import { MODELS, useSettings } from "../context/SettingsContext.jsx";
import { springs } from "../lib/motion.js";
import { cn } from "../lib/utils.js";

export function SettingsModal({ open, onClose }) {
  const { settings, update } = useSettings();
  const { clearAll, conversations, injectDemoAction } = useChat();
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [health, setHealth] = useState(null);
  const modalRef = useRef(null);
  const closeRef = useRef(null);
  const restoreRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    restoreRef.current = document.activeElement;
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 0);

    function onKey(event) {
      if (event.key === "Escape") {
        onCloseRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;
      const root = modalRef.current;
      if (!root) return;
      const focusable = Array.from(
        root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      ).filter((el) => !el.disabled && el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKey);
      const restore = restoreRef.current;
      if (restore && typeof restore.focus === "function") restore.focus();
    };
  }, [open]);

  async function testConnection() {
    setTesting(true);
    setHealth(null);
    try {
      const data = await checkJarvisHealth(settings.jarvisUrl);
      setHealth({ ok: true, data });
    } catch (e) {
      setHealth({ ok: false, error: e.message });
    } finally {
      setTesting(false);
    }
  }

  function previewBooking() {
    injectDemoAction();
    onClose();
  }

  const isJarvis = settings.backend === "jarvis";
  const usingKey = Boolean(settings.apiKey.trim());

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-overlay"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          data-testid="settings-modal"
        >
          <motion.div
            className="modal"
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.94, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={springs.panel}
          >
            <div className="modal-head">
              <div>
                <span className="modal-kicker">Astra</span>
                <h2>Settings</h2>
              </div>
              <button className="icon-round subtle" type="button" ref={closeRef} onClick={onClose} aria-label="Close settings">
                <X aria-hidden="true" />
              </button>
            </div>

            <div className="modal-body">
              <section className="field">
                <label>
                  <Plug aria-hidden="true" /> Connection
                </label>
                <div className="seg" role="group" aria-label="Connection">
                  <button
                    type="button"
                    className={cn(isJarvis && "active")}
                    onClick={() => {
                      update({ backend: "jarvis" });
                      setHealth(null);
                    }}
                  >
                    Local RovaOS
                  </button>
                  <button
                    type="button"
                    className={cn(!isJarvis && "active")}
                    onClick={() => {
                      update({ backend: "anthropic" });
                      setHealth(null);
                    }}
                  >
                    Anthropic key
                  </button>
                </div>
              </section>

              {isJarvis ? (
                <>
                  <section className="field">
                    <label htmlFor="jarvis-url">Backend URL</label>
                    <div className="key-row">
                      <input
                        id="jarvis-url"
                        className="input"
                        type="text"
                        placeholder="ws://localhost:8888"
                        value={settings.jarvisUrl}
                        onChange={(e) => {
                          update({ jarvisUrl: e.target.value });
                          setHealth(null);
                        }}
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <button type="button" className="seg-btn" onClick={testConnection} disabled={testing}>
                        {testing ? "Testing..." : "Test"}
                      </button>
                    </div>
                    {health && (
                      <p className={cn("health-note", health.ok ? "ok" : "bad")}>
                        {health.ok ? <CheckCircle2 aria-hidden="true" /> : <XCircle aria-hidden="true" />}
                        <span>
                          {health.ok
                            ? "Connected to RovaOS."
                            : `Could not reach the backend: ${health.error}. Start the backend and try again.`}
                        </span>
                      </p>
                    )}
                  </section>

                  <section className="field">
                    <label htmlFor="jarvis-key">
                      <KeyRound aria-hidden="true" /> Anthropic API key <span className="opt">(optional)</span>
                    </label>
                    <div className="key-row">
                      <input
                        id="jarvis-key"
                        className="input"
                        type={showKey ? "text" : "password"}
                        placeholder="sk-ant-..."
                        value={settings.apiKey}
                        onChange={(e) => update({ apiKey: e.target.value })}
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <button
                        type="button"
                        className="icon-round subtle"
                        onClick={() => setShowKey((v) => !v)}
                        aria-label={showKey ? "Hide key" : "Show key"}
                      >
                        {showKey ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                      </button>
                    </div>
                    <p className="note">
                      Stored in this browser and forwarded to the local backend only when present.
                    </p>
                  </section>
                </>
              ) : (
                <>
                  <section className="field">
                    <label htmlFor="api-key">
                      <KeyRound aria-hidden="true" /> Anthropic API key
                    </label>
                    <div className="key-row">
                      <input
                        id="api-key"
                        className="input"
                        type={showKey ? "text" : "password"}
                        placeholder="sk-ant-..."
                        value={settings.apiKey}
                        onChange={(e) => update({ apiKey: e.target.value })}
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <button
                        type="button"
                        className="icon-round subtle"
                        onClick={() => setShowKey((v) => !v)}
                        aria-label={showKey ? "Hide key" : "Show key"}
                      >
                        {showKey ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                      </button>
                    </div>
                    <p className="note">
                      {usingKey ? "Ready to stream from Anthropic." : "Required for direct browser mode."}
                    </p>
                  </section>

                  <section className="field">
                    <label htmlFor="model">Model</label>
                    <select
                      id="model"
                      className="input"
                      value={settings.model}
                      onChange={(e) => update({ model: e.target.value })}
                      disabled={!usingKey}
                    >
                      {MODELS.map((m) => (
                        <option value={m.id} key={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </section>
                </>
              )}

              <section className="field">
                <label>Developer preview</label>
                <button type="button" className="preview-btn" onClick={previewBooking}>
                  <Sparkles aria-hidden="true" />
                  <span>Preview a booking</span>
                </button>
                <p className="note">Injects sample Calendar and Email confirmations into the current chat.</p>
              </section>

              <section className="field">
                <label>Data</label>
                <button
                  type="button"
                  className="danger-btn"
                  disabled={conversations.length === 0}
                  onClick={() => {
                    if (window.confirm("Delete all conversations? This cannot be undone.")) clearAll();
                  }}
                >
                  <Trash2 aria-hidden="true" /> Clear all conversations
                </button>
                <p className="note">
                  {conversations.length} stored conversation{conversations.length === 1 ? "" : "s"}.
                </p>
              </section>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
