import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { CalendarDays, Clock3, Inbox, Mail, Sparkles } from "lucide-react";
import { format, formatDistanceStrict, parseISO } from "date-fns";
import { jarvisHttpBase } from "../agent/jarvis.js";
import { useChat } from "../context/ChatContext.jsx";
import { useSettings } from "../context/SettingsContext.jsx";
import { PRINCIPAL_NAME, STATIC_HOME_CARDS, SUGGESTIONS } from "../lib/config.js";
import { fadeUp, reduceAware, springs, stagger } from "../lib/motion.js";
import { useReducedMotionPreference } from "../lib/useReducedMotionPreference.js";
import { Composer } from "./Composer.jsx";

const ICONS = {
  calendar: CalendarDays,
  mail: Mail,
  clock: Clock3,
  spark: Sparkles,
  briefing: Sparkles,
  inbox: Inbox,
};

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function SuggestionChips({ compact = false }) {
  const { send, isStreaming } = useChat();
  return (
    <motion.div className={compact ? "suggestions compact" : "suggestions"} variants={stagger} initial="hidden" animate="show">
      {SUGGESTIONS.map((item) => {
        const Icon = ICONS[item.icon] || Sparkles;
        return (
          <motion.button
            variants={fadeUp}
            type="button"
            className="suggestion-chip"
            key={item.id}
            onClick={() => send(item.label)}
            disabled={isStreaming}
          >
            <Icon aria-hidden="true" />
            <span>{item.label}</span>
          </motion.button>
        );
      })}
    </motion.div>
  );
}

function cardIcon(icon) {
  const Icon = ICONS[icon] || Sparkles;
  return <Icon aria-hidden="true" />;
}

function liveCardsFrom(data) {
  if (!data?.available) return null;
  const next = data.nextMeeting;
  const cards = [];
  if (next) {
    const start = parseISO(next.start);
    const end = next.end ? parseISO(next.end) : null;
    cards.push({
      id: "next",
      label: "Next",
      value: next.subject || "Upcoming meeting",
      detail: `${format(start, "h:mm a")}${end ? ` · ${formatDistanceStrict(end, start)}` : ""}`,
      prompt: "What's my next meeting about?",
      icon: "clock",
      featured: true,
    });
  } else {
    cards.push({
      id: "next",
      label: "Next",
      value: "Open",
      detail: "No upcoming meeting found",
      prompt: "What's on my calendar today?",
      icon: "clock",
      featured: true,
    });
  }
  cards.push({
    id: "today",
    label: "Today",
    value: `${data.todayCount ?? 0} ${(data.todayCount ?? 0) === 1 ? "event" : "events"}`,
    detail: "Calendar overview",
    prompt: "What's on my calendar today?",
    icon: "calendar",
  });
  cards.push({
    id: "inbox",
    label: "Inbox",
    value: `${data.unread ?? 0} unread`,
    detail: "Messages needing attention",
    prompt: "Triage my unread inbox",
    icon: "inbox",
  });
  return cards;
}

function HomeCards() {
  const { send } = useChat();
  const { settings } = useSettings();
  const [state, setState] = useState({ status: "loading", cards: [] });

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 1500);

    async function loadHome() {
      try {
        const res = await fetch(`${jarvisHttpBase(settings.jarvisUrl)}/api/home`, { signal: controller.signal });
        if (!res.ok) throw new Error("home unavailable");
        const data = await res.json();
        const liveCards = liveCardsFrom(data);
        if (mounted && liveCards) setState({ status: "live", cards: liveCards });
        else if (mounted) setState({ status: "fallback", cards: STATIC_HOME_CARDS });
      } catch {
        if (mounted) setState({ status: "fallback", cards: STATIC_HOME_CARDS });
      } finally {
        window.clearTimeout(timeout);
      }
    }

    loadHome();
    return () => {
      mounted = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [settings.jarvisUrl]);

  if (state.status === "loading") {
    return (
      <div className="home-cards" aria-label="Loading day summary">
        {[0, 1, 2].map((idx) => (
          <div className="home-card skeleton" key={idx}>
            <span />
            <strong />
            <em />
          </div>
        ))}
      </div>
    );
  }

  return (
    <motion.div className="home-cards" variants={stagger} initial="hidden" animate="show" aria-label="Your day">
      {state.cards.map((card) => (
        <motion.button
          variants={fadeUp}
          type="button"
          className={card.featured ? "home-card featured" : "home-card"}
          key={card.id}
          onClick={() => send(card.prompt)}
        >
          <span className="home-card-icon">{cardIcon(card.icon)}</span>
          <span className="home-card-label">{card.label}</span>
          <strong>{card.value}</strong>
          <em>{card.detail}</em>
        </motion.button>
      ))}
    </motion.div>
  );
}

export function Home({ disabled, onDisabledClick }) {
  const reduced = useReducedMotionPreference();
  const title = useMemo(() => `${greeting()}, ${PRINCIPAL_NAME}.`, []);

  return (
    <motion.section
      className="home"
      variants={stagger}
      initial="hidden"
      animate="show"
      exit={reduceAware(
        reduced,
        // AnimatePresence mode="wait" serializes this exit before the
        // conversation can enter, so it must be fast — the soft spring took
        // ~0.7s and made the first send feel sluggish.
        { opacity: 0, scale: 0.97, transition: { duration: 0.14, ease: "easeIn" } },
        { opacity: 0, transition: { duration: 0.08 } }
      )}
      transition={springs.soft}
      data-testid="home-screen"
    >
      <motion.div className="home-center" variants={stagger}>
        <motion.div className="hero-copy" variants={fadeUp}>
          <h1>{title}</h1>
          <p>What should we tackle first?</p>
        </motion.div>
        <motion.div variants={fadeUp} className="home-composer-stage">
          <Composer disabled={disabled} onDisabledClick={onDisabledClick} placement="home" />
        </motion.div>
        <SuggestionChips />
      </motion.div>
      <motion.div variants={fadeUp} className="home-card-stage">
        <HomeCards />
      </motion.div>
    </motion.section>
  );
}
