// Client for the local RovaOS / Jarvis backend (projects/jarvis/backend/app.py).
//
// Wire protocol over WebSocket at  <base>/ws/{sessionId} :
//   client → { "type": "message", "text": "<user text>" }
//   server → { "type": "tool_call", "id": "<id>", "tool": "<name>", "input": {...} }   (0+ times)
//   server → { "type": "tool_result", "id": "<id>", "tool": "<name>", "output": "..." } (0+ times)
//   server → { "type": "response", "text": "<final answer>" }            (once, then done)
//   server → { "type": "approval_required", ... } for gated write actions
//
// Approval tokens are intentionally held in this module's private, in-memory vault.
// They are never included in an event passed to React, persisted, logged, or rendered.
//
// The Anthropic key lives on the SERVER, so the browser needs no key in this mode.
// We open one socket per message and reuse the conversation id as the session id,
// so the backend keeps the thread's history in memory across turns.

import { uid, abortError } from "../lib/utils.js";
import { approvalExpiryMs } from "../lib/approval.js";

const approvalSecrets = new Map();

function approvalKey(sessionId, actionId) {
  return JSON.stringify([String(sessionId), String(actionId)]);
}

function rememberApprovalSecret(sessionId, actionId, token, expiresAt) {
  if (!sessionId || !actionId || typeof token !== "string" || !token) return false;
  const key = approvalKey(sessionId, actionId);
  const previous = approvalSecrets.get(key);
  if (previous?.timer) window.clearTimeout(previous.timer);

  const expiryTime = approvalExpiryMs(expiresAt);
  const delay = expiryTime ? Math.max(0, expiryTime - Date.now()) : 15 * 60 * 1000;
  const timer = window.setTimeout(() => approvalSecrets.delete(key), Math.min(delay + 1000, 2_147_000_000));
  approvalSecrets.set(key, { token, timer });
  return true;
}

function claimApprovalSecret(sessionId, actionId) {
  const key = approvalKey(sessionId, actionId);
  const secret = approvalSecrets.get(key);
  if (!secret) return "";
  approvalSecrets.delete(key);
  if (secret.timer) window.clearTimeout(secret.timer);
  return secret.token;
}

export function forgetApprovalSecrets(sessionId) {
  const prefix = `[${JSON.stringify(String(sessionId))},`;
  for (const [key, secret] of approvalSecrets) {
    if (!key.startsWith(prefix)) continue;
    if (secret.timer) window.clearTimeout(secret.timer);
    approvalSecrets.delete(key);
  }
}

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

export function callJarvis({ baseUrl, sessionId, text, apiKey, onEvent, signal, idleTimeoutMs = 240_000 }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    let ws;
    try {
      ws = new WebSocket(toWsUrl(baseUrl, sessionId));
    } catch {
      reject(new Error(`Can't open a connection to RovaOS at ${baseUrl}.`));
      return;
    }

    let settled = false;
    let gotResponse = false;

    // A half-open socket fires no error/close event, so without a watchdog the
    // message would stay "working" forever. Any server event proves liveness
    // and re-arms it; only sustained silence fails the turn.
    let idleTimer = 0;
    const armIdleTimer = () => {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(
        () => fail(new Error("RovaOS stopped responding. Check the backend and try again.")),
        idleTimeoutMs
      );
    };

    const cleanup = () => {
      window.clearTimeout(idleTimer);
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
    armIdleTimer();

    ws.onopen = () => {
      armIdleTimer();
      const payload = { type: "message", text };
      // Pass the browser-held key through so the server can use it when it has
      // no ANTHROPIC_API_KEY of its own (no .env editing required).
      if (apiKey && apiKey.trim()) payload.api_key = apiKey.trim();
      ws.send(JSON.stringify(payload));
    };

    ws.onmessage = (event) => {
      armIdleTimer();
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.type === "tool_call") {
        onEvent({ type: "status", value: "working" });
        onEvent({ type: "tool_call", id: msg.id || uid("tool"), tool: msg.tool, input: msg.input || {} });
      } else if (msg.type === "approval_required") {
        const actionId = typeof msg.action_id === "string" ? msg.action_id : "";
        const approvalToken = typeof msg.approval_token === "string" ? msg.approval_token : "";
        if (!rememberApprovalSecret(sessionId, actionId, approvalToken, msg.expires_at)) {
          onEvent({
            type: "action_error",
            id: msg.id,
            actionId,
            tool: msg.tool,
            code: "invalid_approval_request",
            message: "RovaOS returned an invalid approval request.",
          });
          return;
        }
        onEvent({
          type: "approval_required",
          id: msg.id || uid("tool"),
          actionId,
          tool: msg.tool,
          input: msg.input || {},
          effect: msg.effect || "This action changes data in a connected service.",
          expiresAt: msg.expires_at || null,
          message: msg.message || "Review this exact action, then use Approve or Cancel.",
        });
      } else if (msg.type === "tool_result") {
        onEvent({ type: "tool_result", id: msg.id || uid("tool"), tool: msg.tool, output: msg.output });
      } else if (msg.type === "response") {
        gotResponse = true;
        onEvent({ type: "status", value: "streaming" });
        onEvent({ type: "text", value: msg.text || "" });
        done(msg.text || "");
      } else if (msg.type === "error") {
        fail(new Error(msg.message || "RovaOS returned an error."));
      }
    };

    ws.onerror = () => {
      fail(new Error(`Couldn't reach RovaOS at ${baseUrl}. Is the backend running? (python app.py)`));
    };

    ws.onclose = () => {
      if (!settled && !gotResponse) {
        fail(new Error("RovaOS closed the connection before replying."));
      }
    };
  });
}

// Approve or cancel a single pending action over a short-lived socket. The
// approval secret is claimed before the socket opens, making every decision
// single-use even if a button is double-clicked or the network fails midway.
export function decideJarvisAction({ baseUrl, sessionId, actionId, decision, onEvent, signal, timeoutMs = 60_000 }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    if (decision !== "approve" && decision !== "cancel") {
      reject(new Error("Approval decision must be approve or cancel."));
      return;
    }

    let approvalToken = claimApprovalSecret(sessionId, actionId);
    if (!approvalToken) {
      reject(new Error("This approval is no longer available. Request the action again."));
      return;
    }

    let ws;
    try {
      ws = new WebSocket(toWsUrl(baseUrl, sessionId));
    } catch {
      approvalToken = "";
      reject(new Error(`Can't open a connection to RovaOS at ${baseUrl}.`));
      return;
    }

    let settled = false;
    const timeout = window.setTimeout(() => fail(new Error("RovaOS did not finish the action in time.")), timeoutMs);

    const cleanup = () => {
      window.clearTimeout(timeout);
      signal?.removeEventListener?.("abort", onAbort);
      approvalToken = "";
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
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    function onAbort() {
      fail(abortError());
    }
    signal?.addEventListener?.("abort", onAbort, { once: true });

    ws.onopen = () => {
      const payload = JSON.stringify({
        type: decision === "approve" ? "approve_action" : "cancel_action",
        action_id: actionId,
        approval_token: approvalToken,
      });
      approvalToken = "";
      ws.send(payload);
    };

    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.action_id && msg.action_id !== actionId) return;

      if (msg.type === "action_state") {
        onEvent({
          type: "action_state",
          id: msg.id,
          actionId,
          tool: msg.tool,
          status: msg.status || "executing",
        });
        if (msg.status === "cancelled") done({ status: "cancelled" });
      } else if (msg.type === "action_result") {
        onEvent({
          type: "action_result",
          id: msg.id,
          actionId,
          tool: msg.tool,
          status: msg.status,
          output: msg.output,
        });
        done({ status: msg.status, output: msg.output });
      } else if (msg.type === "action_error" || msg.type === "error") {
        const error = new Error(msg.message || "RovaOS could not complete the action.");
        error.code = msg.code || "action_failed";
        error.reported = true;
        onEvent({
          type: "action_error",
          id: msg.id,
          actionId,
          tool: msg.tool,
          code: error.code,
          message: error.message,
        });
        fail(error);
      }
    };

    ws.onerror = () => fail(new Error(`Couldn't reach RovaOS at ${baseUrl}.`));
    ws.onclose = () => {
      if (!settled) fail(new Error("RovaOS closed the connection before the action finished."));
    };
  });
}
