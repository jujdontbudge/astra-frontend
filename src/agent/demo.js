import { galleryBlocks, sampleCalendarInput, sampleEmailInput } from "../lib/tooling.js";
import { sleep, uid } from "../lib/utils.js";

function lower(text) {
  return String(text || "").toLowerCase();
}

function shouldShowCalendar(text) {
  const value = lower(text);
  return value.includes("schedule") || value.includes("book") || value.includes("meeting") || value.includes("calendar");
}

function shouldShowInbox(text) {
  const value = lower(text);
  return value.includes("inbox") || value.includes("email") || value.includes("unread") || value.includes("triage");
}

function shouldShowBriefing(text) {
  const value = lower(text);
  return value.includes("briefing") || value.includes("morning") || value.includes("today");
}

async function emitTool({ onEvent, signal, tool, input, result }) {
  const id = uid("demo-tool");
  onEvent({ type: "status", value: "working" });
  onEvent({ type: "tool_call", id, tool, input, demo: true });
  await sleep(340, signal);
  onEvent({ type: "tool_result", id, tool, output: JSON.stringify(result) });
}

export async function callDemoAgent({ text, onEvent, signal }) {
  if (signal?.aborted) return;
  onEvent({ type: "status", value: "thinking" });
  await sleep(320, signal);

  const calendar = shouldShowCalendar(text);
  const inbox = shouldShowInbox(text);
  const briefing = shouldShowBriefing(text);

  if (calendar) {
    await emitTool({
      onEvent,
      signal,
      tool: "create_calendar_event",
      input: sampleCalendarInput,
      result: { event_id: `demo-${Date.now()}`, subject: sampleCalendarInput.subject, status: "created" },
    });
    await sleep(170, signal);
    await emitTool({
      onEvent,
      signal,
      tool: "send_email",
      input: sampleEmailInput,
      result: { status: "sent", to: sampleEmailInput.to, subject: sampleEmailInput.subject },
    });
  } else if (inbox || briefing) {
    await emitTool({
      onEvent,
      signal,
      tool: "list_recent_emails",
      input: galleryBlocks.toolDone.input,
      result: galleryBlocks.toolDone.result,
    });
  }

  await sleep(260, signal);
  onEvent({ type: "status", value: "streaming" });

  const answer = calendar
    ? "Offline demo mode: sample meeting booked and confirmation email shown."
    : inbox
      ? "Offline demo mode: found 7 sample unread messages."
      : briefing
        ? "Offline demo mode: next meeting, 4 calendar items, and 7 unread emails."
        : "Offline demo mode. The interface is usable; connect RovaOS in Settings for live tools.";

  onEvent({ type: "text", value: answer });
  return answer;
}
