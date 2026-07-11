import { addMinutes, format, formatDistanceStrict, parseISO } from "date-fns";

export function classifyTool(tool) {
  if (tool === "create_calendar_event") return "calendar";
  if (tool === "send_email") return "email";
  return "tool";
}

const TOOL_TITLES = {
  search_emails: "Search inbox",
  list_recent_emails: "List recent email",
  read_email: "Read email",
  list_upcoming_events: "Check calendar",
  check_availability: "Check availability",
  set_reminder: "Set reminder",
  list_reminders: "List reminders",
  create_draft_email: "Draft email",
  reply_to_email: "Reply to email",
  forward_email: "Forward email",
  send_teams_message: "Send Teams message",
  web_search: "Search the web",
  run_morning_digest: "Run morning briefing",
  run_eod_digest: "Run end-of-day digest",
};

export function humanizeTool(tool = "") {
  if (TOOL_TITLES[tool]) return TOOL_TITLES[tool];
  return String(tool || "tool")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function firstArray(result) {
  if (!result || typeof result !== "object") return null;
  for (const key of ["results", "emails", "events", "reminders"]) {
    if (Array.isArray(result[key])) return { key, value: result[key] };
  }
  return null;
}

export function summarizeResult(result) {
  if (!result) return "No result details";
  if (typeof result === "string") return result;
  const arr = firstArray(result);
  if (arr) return `${arr.value.length} ${arr.value.length === 1 ? "result" : "results"}`;
  if (result.status) return String(result.status).replace(/[_-]+/g, " ");
  if (result.isError === false || result.ok === true || result.success === true) return "Completed";
  for (const [key, value] of Object.entries(result)) {
    if (["isError", "ok", "success", "partial"].includes(key) || typeof value === "boolean") continue;
    if (["string", "number"].includes(typeof value)) return String(value);
  }
  return "Completed";
}

export function isFailure(result, expectedStatus) {
  if (!result || (typeof result === "object" && !Array.isArray(result) && Object.keys(result).length === 0)) return true;
  if (result.error || result.ok === false) return true;
  const status = typeof result.status === "string" ? result.status.toLowerCase().replace(/[\s-]+/g, "_") : "";
  if (["error", "failed", "failure", "cancelled", "canceled", "rejected", "denied"].includes(status)) return true;
  if (expectedStatus) {
    const expected = expectedStatus.toLowerCase().replace(/[\s-]+/g, "_");
    if (status) return status !== expected;
    const hasConnectorEvidence =
      expected === "created"
        ? Boolean(result.event_id || result.eventId || result.id || result.webLink)
        : expected === "sent"
          ? Boolean(result.message_id || result.messageId || result.id)
          : false;
    return !hasConnectorEvidence;
  }
  return false;
}

export function safeErrorMessage(value, fallback = "The connected action failed.") {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object") {
    for (const key of ["message", "detail", "error", "code"]) {
      if (!Object.hasOwn(value, key)) continue;
      const message = safeErrorMessage(value[key], "");
      if (message) return message;
    }
  }
  return fallback;
}

export function formatDateRange(start, end) {
  const startDate = typeof start === "string" ? parseISO(start) : new Date(start || Date.now());
  const endDate = end ? (typeof end === "string" ? parseISO(end) : new Date(end)) : addMinutes(startDate, 30);
  const sameDay = format(startDate, "MMM d") === format(endDate, "MMM d");
  const time = `${format(startDate, "h:mm a")}-${format(endDate, "h:mm a")}`;
  const duration = formatDistanceStrict(endDate, startDate);
  return {
    month: format(startDate, "MMM").toUpperCase(),
    day: format(startDate, "d"),
    line: `${format(startDate, "EEE")} · ${sameDay ? time : `${format(startDate, "MMM d, h:mm a")} to ${format(endDate, "MMM d, h:mm a")}`} · ${duration}`,
  };
}

export const sampleCalendarInput = {
  subject: "Q3 planning sync",
  start: "2026-06-24T14:30:00-04:00",
  end: "2026-06-24T15:00:00-04:00",
  location: "Microsoft Teams",
  is_online: true,
  attendees: ["rohan@rova.ai", "ben@rova.ai", "maya@rova.ai"],
};

export const sampleEmailInput = {
  to: ["ben@rova.ai", "maya@rova.ai", "ops@rova.ai"],
  cc: ["rohan@rova.ai"],
  subject: "Q3 planning sync confirmed",
  body: "Hi Ben, I booked the Q3 planning sync for Wednesday afternoon and included the agenda notes from this morning's briefing. RovaOS will keep an eye on follow-ups.",
  importance: "normal",
};

export const galleryBlocks = {
  calendar: {
    id: "demo-calendar",
    kind: "calendar",
    tool: "create_calendar_event",
    status: "done",
    input: sampleCalendarInput,
    result: { event_id: "evt_123", subject: sampleCalendarInput.subject, status: "created" },
  },
  calendarSolo: {
    id: "demo-calendar-solo",
    kind: "calendar",
    tool: "create_calendar_event",
    status: "done",
    input: {
      subject: "Focus block",
      start: "2026-06-25T10:00:00-04:00",
      end: "2026-06-25T11:30:00-04:00",
      location: "Office",
      is_online: false,
      attendees: [],
    },
    result: { event_id: "evt_456", subject: "Focus block", status: "created" },
  },
  calendarError: {
    id: "demo-calendar-error",
    kind: "calendar",
    tool: "create_calendar_event",
    status: "error",
    input: sampleCalendarInput,
    result: { error: "Calendar permission is missing" },
  },
  email: {
    id: "demo-email",
    kind: "email",
    tool: "send_email",
    status: "done",
    input: sampleEmailInput,
    result: { status: "sent", to: sampleEmailInput.to, subject: sampleEmailInput.subject },
  },
  emailHigh: {
    id: "demo-email-high",
    kind: "email",
    tool: "send_email",
    status: "done",
    input: { ...sampleEmailInput, importance: "high", subject: "Priority follow-up" },
    result: { status: "sent", to: sampleEmailInput.to, subject: "Priority follow-up" },
  },
  emailError: {
    id: "demo-email-error",
    kind: "email",
    tool: "send_email",
    status: "error",
    input: sampleEmailInput,
    result: { error: "Mail service rejected the request" },
  },
  toolRunning: {
    id: "demo-tool-running",
    kind: "tool",
    tool: "search_emails",
    status: "running",
    input: { query: "budget review", top: 10 },
    result: null,
  },
  toolDone: {
    id: "demo-tool-done",
    kind: "tool",
    tool: "list_recent_emails",
    status: "done",
    input: { top: 25, unread_only: true },
    result: { emails: [{ id: "1" }, { id: "2" }, { id: "3" }, { id: "4" }, { id: "5" }, { id: "6" }, { id: "7" }] },
  },
  toolError: {
    id: "demo-tool-error",
    kind: "tool",
    tool: "check_availability",
    status: "error",
    input: { start_date: "2026-06-24", end_date: "2026-06-25" },
    result: { error: "Calendar connection expired" },
  },
};
