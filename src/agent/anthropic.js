// Optional bring-your-own-key client. Streams directly from the browser to the
// Anthropic API. The key lives only in the user's own localStorage and is sent
// only to api.anthropic.com — there is no app server in between.

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

const SYSTEM = `You are RovaOS, an executive AI operator.
Be concise, concrete, and useful. Use Markdown: short paragraphs, bullet lists, and tables when they clarify calendar, email, meeting, or operations work. Do not use emoji.`;

function toApiMessages(history, limit = 20) {
  return history
    .filter((m) => (m.role === "user" || m.role === "assistant") && (m.text || "").trim())
    .slice(-limit)
    .map((m) => ({ role: m.role, content: m.text.trim() }));
}

export async function callAnthropic({ apiKey, model, mode, history, onEvent, signal, idleTimeoutMs = 120_000 }) {
  onEvent({ type: "status", value: "thinking" });

  const system =
    SYSTEM + (mode === "Ask" ? "\nThe user is in Ask mode: explain and advise; do not pretend to edit files." : "");

  // A stalled response body never rejects on its own, which would pin the
  // message at "working" forever. Abort after sustained silence; every chunk
  // that arrives re-arms the watchdog.
  const watchdog = new AbortController();
  let idleTimer = 0;
  let timedOut = false;
  const armIdleTimer = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      timedOut = true;
      watchdog.abort();
    }, idleTimeoutMs);
  };
  const onCallerAbort = () => watchdog.abort();
  signal?.addEventListener?.("abort", onCallerAbort, { once: true });
  armIdleTimer();

  try {
    return await streamAnthropic({ apiKey, model, system, history, onEvent, signal: watchdog.signal, armIdleTimer });
  } catch (error) {
    if (timedOut) throw new Error("Anthropic stopped responding. Check your connection and try again.");
    throw error;
  } finally {
    clearTimeout(idleTimer);
    signal?.removeEventListener?.("abort", onCallerAbort);
  }
}

async function streamAnthropic({ apiKey, model, system, history, onEvent, signal, armIdleTimer }) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": API_VERSION,
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: model || "claude-sonnet-4-6",
      max_tokens: 2048,
      system,
      stream: true,
      messages: toApiMessages(history),
    }),
  });

  if (!res.ok || !res.body) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (data?.error?.message) detail = data.error.message;
    } catch {
      /* ignore parse failure */
    }
    throw new Error(`Anthropic API error: ${detail}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let started = false;

  while (true) {
    const { value, done } = await reader.read();
    armIdleTimer();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;

      let evt;
      try {
        evt = JSON.parse(payload);
      } catch {
        continue;
      }

      if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
        if (!started) {
          started = true;
          onEvent({ type: "status", value: "streaming" });
        }
        onEvent({ type: "text", value: evt.delta.text });
      } else if (evt.type === "error") {
        throw new Error(evt.error?.message || "Stream error");
      }
    }
  }
}
