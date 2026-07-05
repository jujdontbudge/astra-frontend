import { Calendar, KeyRound, Mail, Receipt, Sparkles } from "lucide-react";
import { useChat } from "../context/ChatContext.jsx";
import { useSettings } from "../context/SettingsContext.jsx";
import { isReady } from "../agent/runAgent.js";

const PROMPTS = [
  { title: "Today", icon: Calendar, prompt: "What's on my calendar today, and which emails should I reply to first?" },
  { title: "Inbox", icon: Mail, prompt: "Summarize my unread emails and draft replies to the urgent ones." },
  { title: "Spend", icon: Receipt, prompt: "Show this month's Ramp spend and flag anything unusual." },
  { title: "Briefing", icon: Sparkles, prompt: "Run my morning briefing." },
];

export function StartScreen({ onOpenSettings }) {
  const { send } = useChat();
  const { settings } = useSettings();

  if (!isReady(settings)) {
    return (
      <section className="start" aria-label="Start">
        <div className="start-inner">
          <p className="kicker">Astra</p>
          <h1>Connect your API key</h1>
          <p className="start-sub">
            Astra runs on your own Anthropic API key. It's stored only in this browser and sent straight to
            Anthropic — there's no server in between. Add it to start.
          </p>
          <button className="connect-cta" type="button" onClick={onOpenSettings}>
            <KeyRound strokeWidth={2.1} /> Add API key
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="start" aria-label="Start">
      <div className="start-inner">
        <p className="kicker">RovaOS</p>
        <h1>What should we work on?</h1>
        <div className="prompt-grid">
          {PROMPTS.map(({ title, icon: Icon, prompt }, index) => (
            <button
              className="prompt-card"
              key={title}
              type="button"
              style={{ "--delay": `${index * 70}ms` }}
              onClick={() => send(prompt)}
            >
              <span className="prompt-icon">
                <Icon strokeWidth={2.1} />
              </span>
              <strong>{title}</strong>
              <span className="prompt-text">{prompt}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
