// Client for the local RovaOS / Jarvis backend (projects/jarvis/backend/app.py).
//
// Wire protocol over WebSocket at  <base>/ws/{sessionId} :
//   client → { "type": "message", "text": "<user text>" }
//   server → { "type": "tool_call", "id": "<id>", "tool": "<name>", "input": {...} }   (0+ times)
//   server → { "type": "tool_result", "id": "<id>", "tool": "<name>", "output": "..." } (0+ times)
//   server → { "type": "response", "text": "<final answer>" }            (once, then done)
//
// The Anthropic key lives on the SERVER, so the browser needs no key in this mode.
// We open one socket per message and reuse the conversation id as the session id,
// so the backend keeps the thread's history in memory across turns.

import { uid, abortError } from "../lib/utils.js";

// Normalise a user-entered base ("localhost:8888", "http://…", "ws://…") to ws/wss.
function toWsUrl(base, sessionId) {
  let u = (base || "ws://localhost:8888").trim().replace(/\/+$/, "");
  u = u.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
  if (!/^wss?:/i.test(u)) u = `ws://${u}`;
  return `${u}/ws/${encodeURIComponent(sessionId)}`;
}

export function jarvisHttpBase(base) {
  return (base || "ws://localhost:8888")
    .trim()
    .replace(/\/+$/, "")
    .replace(/^ws:/i, "http:")
    .replace(/^wss:/i, "https:")
    .replace(/^(?!https?:)/i, "http://");
}

// Used by Settings "Test connection" — hits the FastAPI /api/health endpoint.
export async function checkJarvisHealth(base, signal) {
  const res = await fetch(`${jarvisHttpBase(base)}/api/health`, { method: "GET", signal });
  if (!res.ok) throw new Error(`Health check failed (${res.status})`);
  return res.json();
}

export function callJarvis({ baseUrl, sessionId, text, apiKey, onEvent, signal }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    let ws;
    try {
      ws = new WebSocket(toWsUrl(baseUrl, sessionId));
    } catch {
      reject(new Error(`Can't open a connection to Astra at ${baseUrl}.`));
      return;
    }

    let settled = false;
    let gotResponse = false;

    const cleanup = () => {
      signal?.removeEventListener?.("abort", onAbort);
      try {
        ws.close();
      } catch {
        /* already closing */
      }
    };
    const done = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const fail = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };
    function onAbort() {
      fail(abortError());
    }
    signal?.addEventListener?.("abort", onAbort, { once: true });

    onEvent({ type: "status", value: "thinking" });

    ws.onopen = () => {
      const payload = { type: "message", text };
      // Pass the browser-held key through so the server can use it when it has
      // no ANTHROPIC_API_KEY of its own (no .env editing required).
      if (apiKey && apiKey.trim()) payload.api_key = apiKey.trim();
      ws.send(JSON.stringify(payload));
    };

    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.type === "tool_call") {
        onEvent({ type: "status", value: "working" });
        onEvent({ type: "tool_call", id: msg.id || uid("tool"), tool: msg.tool, input: msg.input || {} });
      } else if (msg.type === "tool_result") {
        onEvent({ type: "tool_result", id: msg.id || uid("tool"), tool: msg.tool, output: msg.output });
      } else if (msg.type === "response") {
        gotResponse = true;
        onEvent({ type: "status", value: "streaming" });
        onEvent({ type: "text", value: msg.text || "" });
        done(msg.text || "");
      } else if (msg.type === "error") {
        fail(new Error(msg.message || "Astra returned an error."));
      }
    };

    ws.onerror = () => {
      fail(new Error(`Couldn't reach Astra at ${baseUrl}. Is the backend running? (python app.py)`));
    };

    ws.onclose = () => {
      if (!settled && !gotResponse) {
        fail(new Error("Astra closed the connection before replying."));
      }
    };
  });
}
