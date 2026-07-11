import assert from "node:assert/strict";

globalThis.window = {
  setTimeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout,
};

const sockets = [];
const TOKEN_ONE = "unit-secret-approval-one";
const TOKEN_TWO = "unit-secret-approval-two";

class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.sent = [];
    this.closed = false;
    sockets.push(this);
    queueMicrotask(() => this.onopen?.());
  }

  send(raw) {
    this.sent.push(raw);
    const message = JSON.parse(raw);
    if (message.type === "message") {
      const second = message.text.includes("cancel");
      const actionId = second ? "action-cancel" : "action-approve";
      const token = second ? TOKEN_TWO : TOKEN_ONE;
      this.emit({ type: "tool_call", id: `tool-${actionId}`, tool: "send_email", input: { to: ["test@example.com"], subject: second ? "Cancel" : "Approve" } });
      this.emit({
        type: "approval_required",
        id: `tool-${actionId}`,
        action_id: actionId,
        approval_token: token,
        tool: "send_email",
        input: { to: ["test@example.com"], subject: second ? "Cancel" : "Approve" },
        effect: "Send one email to test@example.com.",
        expires_at: Math.floor(Date.now() / 1000) + 900,
      });
      this.emit({
        type: "tool_result",
        id: `tool-${actionId}`,
        tool: "send_email",
        output: JSON.stringify({ status: "approval_required", action_id: actionId }),
      });
      this.emit({ type: "response", text: "Waiting for structured approval." });
      return;
    }

    if (message.type === "approve_action") {
      this.emit({ type: "action_state", action_id: message.action_id, id: "tool-action-approve", tool: "send_email", status: "approved" });
      this.emit({ type: "action_state", action_id: message.action_id, id: "tool-action-approve", tool: "send_email", status: "executing" });
      this.emit({ type: "action_state", action_id: message.action_id, id: "tool-action-approve", tool: "send_email", status: "succeeded" });
      this.emit({
        type: "action_result",
        action_id: message.action_id,
        id: "tool-action-approve",
        tool: "send_email",
        status: "succeeded",
        output: JSON.stringify({ status: "sent", message_id: "unit-message" }),
      });
      return;
    }

    if (message.type === "cancel_action") {
      this.emit({ type: "action_state", action_id: message.action_id, id: "tool-action-cancel", tool: "send_email", status: "cancelled" });
    }
  }

  emit(message) {
    queueMicrotask(() => {
      if (!this.closed) this.onmessage?.({ data: JSON.stringify(message) });
    });
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    queueMicrotask(() => this.onclose?.());
  }
}

globalThis.WebSocket = MockWebSocket;

const { callJarvis, decideJarvisAction } = await import("../src/agent/jarvis.js");
const { safeErrorMessage } = await import("../src/lib/tooling.js");

assert.equal(
  safeErrorMessage({ code: "live_sop_execution_not_implemented", message: "Live SOP execution is unavailable." }),
  "Live SOP execution is unavailable.",
  "structured provider failures must be converted to render-safe text"
);
assert.equal(safeErrorMessage({ error: { code: "nested_failure" } }), "nested_failure");

const approvalEvents = [];
await callJarvis({
  baseUrl: "ws://unit.test",
  sessionId: "session-unit",
  text: "approve this",
  apiKey: "",
  onEvent: (event) => approvalEvents.push(event),
});

assert.equal(approvalEvents.some((event) => event.type === "approval_required"), true);
assert.equal(JSON.stringify(approvalEvents).includes(TOKEN_ONE), false, "approval token must not enter public events");
assert.equal(Object.hasOwn(approvalEvents.find((event) => event.type === "approval_required"), "approval_token"), false);

const actionEvents = [];
await decideJarvisAction({
  baseUrl: "ws://unit.test",
  sessionId: "session-unit",
  actionId: "action-approve",
  decision: "approve",
  onEvent: (event) => actionEvents.push(event),
});

const approveWireMessage = JSON.parse(sockets.at(-1).sent[0]);
assert.deepEqual(approveWireMessage, {
  type: "approve_action",
  action_id: "action-approve",
  approval_token: TOKEN_ONE,
});
assert.deepEqual(actionEvents.map((event) => event.type), ["action_state", "action_state", "action_state", "action_result"]);
assert.equal(JSON.stringify(actionEvents).includes(TOKEN_ONE), false, "approval token must not return through action events");

await assert.rejects(
  decideJarvisAction({
    baseUrl: "ws://unit.test",
    sessionId: "session-unit",
    actionId: "action-approve",
    decision: "approve",
    onEvent: () => {},
  }),
  /no longer available/i,
  "an approval must be single-use"
);

const cancelRequestEvents = [];
await callJarvis({
  baseUrl: "ws://unit.test",
  sessionId: "session-unit",
  text: "cancel this",
  apiKey: "",
  onEvent: (event) => cancelRequestEvents.push(event),
});
const cancelEvents = [];
await decideJarvisAction({
  baseUrl: "ws://unit.test",
  sessionId: "session-unit",
  actionId: "action-cancel",
  decision: "cancel",
  onEvent: (event) => cancelEvents.push(event),
});
assert.equal(JSON.parse(sockets.at(-1).sent[0]).approval_token, TOKEN_TWO);
assert.deepEqual(cancelEvents.map((event) => [event.type, event.status]), [["action_state", "cancelled"]]);
assert.equal(JSON.stringify(cancelRequestEvents).includes(TOKEN_TWO), false);

console.log("Approval WebSocket protocol tests passed");
