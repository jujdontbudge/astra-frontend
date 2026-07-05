export const PRINCIPAL_NAME = "Rohan";

export const SUGGESTIONS = [
  { id: "calendar", label: "What's on my calendar today?", icon: "calendar" },
  { id: "inbox", label: "Triage my unread inbox", icon: "mail" },
  { id: "schedule", label: "Schedule a meeting", icon: "clock" },
  { id: "briefing", label: "Run my morning briefing", icon: "spark" },
];

export const STATIC_HOME_CARDS = [
  {
    id: "calendar",
    label: "Calendar",
    value: "Today",
    detail: "Review agenda and open slots",
    prompt: "What's on my calendar today?",
    icon: "calendar",
  },
  {
    id: "inbox",
    label: "Inbox",
    value: "Unread",
    detail: "Prioritize messages that need action",
    prompt: "Triage my unread inbox",
    icon: "mail",
  },
  {
    id: "briefing",
    label: "Briefing",
    value: "Morning",
    detail: "Calendar, inbox, and follow-ups",
    prompt: "Run my morning briefing",
    icon: "briefing",
  },
];
