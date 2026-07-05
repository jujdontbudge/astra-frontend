import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  Loader2,
  Mail,
  MapPin,
  Users,
} from "lucide-react";
import { fadeUp, premiumCard, reduceAware, springs, stagger } from "../lib/motion.js";
import { formatDateRange, humanizeTool, isFailure, summarizeResult } from "../lib/tooling.js";
import { clampText, cn } from "../lib/utils.js";
import { useReducedMotionPreference } from "../lib/useReducedMotionPreference.js";

function CheckMark({ show = true }) {
  const reduced = useReducedMotionPreference();
  if (!show) return null;
  return (
    <motion.span
      className="success-mark"
      aria-hidden="true"
      initial={reduced ? false : { opacity: 0, scale: 0.7, rotate: -14 }}
      animate={{ opacity: 1, scale: 1, rotate: 0 }}
      transition={reduceAware(reduced, { ...springs.grand, delay: 0.42 }, { duration: 0.12 })}
    >
      <svg viewBox="0 0 24 24">
        <motion.path
          d="M5 12.5l4.2 4.1L19 7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduced ? false : { pathLength: 0, opacity: 0 }}
          animate={reduced ? { opacity: 1 } : { pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.72, ease: "easeOut", delay: 0.5 }}
        />
      </svg>
    </motion.span>
  );
}

function DetailRow({ icon: Icon, label, children }) {
  return (
    <motion.div className="hero-detail" variants={fadeUp}>
      <Icon aria-hidden="true" />
      <span className="detail-label">{label}</span>
      <span className="detail-value">{children}</span>
    </motion.div>
  );
}

function CardMotionAccents() {
  return (
    <span className="card-progress-track" aria-hidden="true">
      <span />
    </span>
  );
}

function attendeesFrom(input) {
  const list = Array.isArray(input?.attendees) ? input.attendees : [];
  return list
    .map((att) => (typeof att === "string" ? att : att?.email || att?.name || att?.address || "Guest"))
    .filter(Boolean);
}

function namesLine(names) {
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} +${names.length - 3}`;
}

function initials(value) {
  const clean = String(value).split("@")[0].replace(/[._-]+/g, " ");
  return clean
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function CalendarCard({ block }) {
  const reduced = useReducedMotionPreference();
  const input = block.input || {};
  const result = block.result || {};
  const failed = block.status === "error" || isFailure(result, "created");
  const range = formatDateRange(input.start, input.end);
  const attendees = attendeesFrom(input);
  const online = Boolean(input.is_online || /teams|zoom|meet|online/i.test(input.location || ""));
  const title = attendees.length || online ? "Meeting booked" : "Event added";
  const reason = result.error || result.message || "Calendar action was not confirmed";

  return (
    <motion.article
      className={cn("hero-card calendar-card", failed && "error")}
      variants={premiumCard}
      initial="hidden"
      animate="show"
      exit="exit"
      transition={reduceAware(reduced, springs.grand, { duration: 0.16 })}
      data-testid="calendar-card"
    >
      {!failed && <CardMotionAccents />}
      {!failed && <motion.span className="calendar-fill" initial={reduced ? false : { scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: 0.24, duration: 0.86, ease: [0.16, 1, 0.3, 1] }} />}
      <div className="hero-card-glow" />
      <div className="hero-card-head">
        <div className="date-tile">
          <span>{range.month}</span>
          <strong>{range.day}</strong>
        </div>
        <div className="hero-title-wrap">
          <span className="hero-kicker">{failed ? "Calendar issue" : title}{block.demo ? " · sample" : ""}</span>
          <h3>{failed ? `Couldn't book - ${reason}` : input.subject || result.subject || "Untitled event"}</h3>
        </div>
        {!failed ? <CheckMark /> : <AlertTriangle className="hero-alert" aria-hidden="true" />}
      </div>

      {!failed && (
        <motion.div className="hero-card-details" variants={stagger} initial="hidden" animate="show">
          <DetailRow icon={Clock} label="When">
            {range.line}
          </DetailRow>
          <DetailRow icon={MapPin} label="Where">
            <span className={online ? "online-badge" : ""}>{online ? "Microsoft Teams" : input.location || "Not specified"}</span>
          </DetailRow>
          {attendees.length > 0 && (
            <DetailRow icon={Users} label="Guests">
              <span className="attendees">
                <span className="avatar-stack" aria-hidden="true">
                  {attendees.slice(0, 4).map((att) => (
                    <span className="mini-avatar" key={att}>
                      {initials(att)}
                    </span>
                  ))}
                </span>
                {namesLine(attendees)}
              </span>
            </DetailRow>
          )}
        </motion.div>
      )}
    </motion.article>
  );
}

function recipientLine(to = []) {
  const list = Array.isArray(to) ? to : [to].filter(Boolean);
  if (list.length <= 2) return list.join(", ");
  return `${list.slice(0, 2).join(", ")} +${list.length - 2}`;
}

export function EmailCard({ block }) {
  const reduced = useReducedMotionPreference();
  const input = block.input || {};
  const result = block.result || {};
  const failed = block.status === "error" || isFailure(result, "sent");
  const reason = result.error || result.message || "Email action was not confirmed";
  const importance = input.importance && input.importance !== "normal" ? input.importance : null;

  return (
    <motion.article
      className={cn("hero-card email-card", failed && "error")}
      variants={premiumCard}
      initial="hidden"
      animate="show"
      exit="exit"
      transition={reduceAware(reduced, springs.grand, { duration: 0.16 })}
      data-testid="email-card"
    >
      {!failed && <CardMotionAccents />}
      {!failed && !reduced && <motion.span className="send-sweep" initial={{ x: "-110%" }} animate={{ x: "112%" }} transition={{ delay: 0.26, duration: 1.25, ease: [0.65, 0, 0.35, 1] }} />}
      <div className="hero-card-glow" />
      <div className="hero-card-head">
        <div className="mail-tile">
          <Mail aria-hidden="true" />
        </div>
        <div className="hero-title-wrap">
          <span className="hero-kicker">{failed ? "Email issue" : "Email sent"}{block.demo ? " · sample" : ""}</span>
          <h3>{failed ? `Couldn't send - ${reason}` : input.subject || result.subject || "No subject"}</h3>
        </div>
        {!failed ? <CheckMark /> : <AlertTriangle className="hero-alert" aria-hidden="true" />}
      </div>

      {!failed && (
        <motion.div className="hero-card-details" variants={stagger} initial="hidden" animate="show">
          <DetailRow icon={Mail} label="To">
            {recipientLine(input.to || result.to)}
          </DetailRow>
          <DetailRow icon={CalendarDays} label="Subject">
            {input.subject || result.subject || "No subject"}
          </DetailRow>
          <motion.p className="email-preview" variants={fadeUp}>
            {clampText(input.body || "", 160)}
          </motion.p>
          {importance && (
            <motion.span className="importance-tag" variants={fadeUp}>
              {importance}
            </motion.span>
          )}
        </motion.div>
      )}
    </motion.article>
  );
}

export function ToolChip({ block }) {
  const [open, setOpen] = useState(false);
  const running = block.status === "running";
  const error = block.status === "error" || block.result?.error;
  const title = humanizeTool(block.tool);
  const summary = error ? block.result?.error || "Needs attention" : running ? "working..." : summarizeResult(block.result);

  return (
    <motion.div className={cn("tool-chip", running && "running", error && "error")} layout initial="hidden" animate="show" variants={fadeUp} transition={springs.soft} data-testid="tool-chip">
      {running && <span className="tool-live-line" aria-hidden="true" />}
      <button className="tool-chip-row" type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="tool-state" aria-hidden="true">
          {running ? <Loader2 className="spin" /> : error ? <AlertTriangle /> : <Check />}
        </span>
        <span className="tool-chip-title">
          <span>{title}</span>
        </span>
        <span className="tool-chip-summary">{summary}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={springs.quick}>
          <ChevronDown aria-hidden="true" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="tool-chip-detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
          >
            <div>
              <span>Input</span>
              <pre>{JSON.stringify(block.input || {}, null, 2)}</pre>
            </div>
            <div>
              <span>Result</span>
              <pre>{JSON.stringify(block.result || {}, null, 2)}</pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function ErrorNote({ message }) {
  if (!message) return null;
  return (
    <motion.div className="error-note" variants={fadeUp} initial="hidden" animate="show" data-testid="error-note">
      <AlertTriangle aria-hidden="true" />
      <span>{message}</span>
    </motion.div>
  );
}

export function ActionBlock({ block }) {
  if (block.kind === "calendar") {
    if (block.status === "running") return null;
    return <CalendarCard block={block} />;
  }
  if (block.kind === "email") {
    if (block.status === "running") return null;
    return <EmailCard block={block} />;
  }
  return <ToolChip block={block} />;
}
