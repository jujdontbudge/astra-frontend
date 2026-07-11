import { useEffect, useId, useState } from "react";
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
  ShieldAlert,
  Users,
  X,
} from "lucide-react";
import { useChatActions } from "../context/ChatContext.jsx";
import { approvalExpiryLabel, approvalExpiryMs } from "../lib/approval.js";
import { fadeUp, premiumCard, reduceAware, springs, stagger } from "../lib/motion.js";
import { formatDateRange, humanizeTool, isFailure, safeErrorMessage, summarizeResult } from "../lib/tooling.js";
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
  const detailId = useId();
  const reduced = useReducedMotionPreference();
  const running = block.status === "running";
  const error = Boolean(block.status === "error" || block.result?.error);
  const title = humanizeTool(block.tool);
  const resultSummary = summarizeResult(block.result);
  const summary = error
    ? block.result?.error || "No confirmed result"
    : running
      ? "Running"
      : `Result received · ${resultSummary}`;
  const announcement = error
    ? `${title} failed: ${summary}`
    : running
      ? `${title} is running.`
      : `${title}: result received. ${resultSummary}`;

  return (
    <motion.div className={cn("tool-chip", running && "running", error && "error")} layout initial="hidden" animate="show" variants={fadeUp} transition={springs.soft} data-testid="tool-chip">
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
      {running && <span className="tool-live-line" aria-hidden="true" />}
      <button className="tool-chip-row" type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={detailId}>
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
            id={detailId}
            className="tool-chip-detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduced ? 0.08 : 0.38, ease: [0.16, 1, 0.3, 1] }}
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

const APPROVAL_BUSY = new Set(["approving", "cancelling", "approved", "executing"]);

// Screen readers only announce live-region MUTATIONS, so a region that mounts
// with its text already present is routinely skipped. Mount empty, fill in an
// effect, and use assertive for the initial pending state — it gates the agent.
function ApprovalAnnouncement({ label, detail, assertive }) {
  const [text, setText] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setText(`${label}. ${detail}`), 30);
    return () => window.clearTimeout(timer);
  }, [label, detail]);
  return (
    <p className="sr-only" role={assertive ? "alert" : "status"} aria-live={assertive ? "assertive" : "polite"}>
      {text}
    </p>
  );
}

function approvalStatusCopy(status, expired) {
  if (expired && status === "pending") return { label: "Expired", detail: "This request expired without running." };
  switch (status) {
    case "approving":
      return { label: "Submitting approval", detail: "The one-time approval is being submitted." };
    case "cancelling":
      return { label: "Cancelling", detail: "The cancellation is being submitted." };
    case "approved":
      return { label: "Approved", detail: "RovaOS is claiming the approved action." };
    case "executing":
      return { label: "Running approved action", detail: "The connected service is processing the action." };
    case "succeeded":
      return { label: "Action completed", detail: "The connected service returned a successful result." };
    case "cancelled":
      return { label: "Action cancelled", detail: "The action did not run." };
    case "expired":
      return { label: "Expired", detail: "This request expired without running." };
    case "unavailable":
      return { label: "Approval unavailable", detail: "Request the action again to receive a new approval." };
    case "failed":
      return { label: "Action failed", detail: "The connected action was not confirmed as successful." };
    default:
      return { label: "Approval required", detail: "Nothing will run until you choose Approve." };
  }
}

export function ApprovalCard({ block, messageId }) {
  const { decideApproval } = useChatActions();
  const reduced = useReducedMotionPreference();
  const detailId = useId();
  const titleId = useId();
  const [reviewOpen, setReviewOpen] = useState(true);
  const [clock, setClock] = useState(() => Date.now());
  const approval = block.approval || {};
  const expiry = approvalExpiryMs(approval.expiresAt);
  const expired = Boolean(expiry && clock >= expiry);
  const status = approval.status || "pending";
  const pending = status === "pending" && !expired;
  const busy = APPROVAL_BUSY.has(status);
  const statusCopy = approvalStatusCopy(status, expired);
  const exactInput = JSON.stringify(block.input || {}, null, 2);
  const exactResult = block.result == null ? null : JSON.stringify(block.result, null, 2);
  const approvalError = approval.error ? safeErrorMessage(approval.error) : null;

  useEffect(() => {
    if (!expiry || status !== "pending" || expiry <= Date.now()) return undefined;
    const timer = window.setTimeout(() => setClock(Date.now()), Math.min(expiry - Date.now() + 25, 2_147_000_000));
    return () => window.clearTimeout(timer);
  }, [expiry, status]);

  return (
    <motion.article
      className={cn("approval-card", `is-${status}`, expired && "is-expired")}
      variants={premiumCard}
      initial="hidden"
      animate="show"
      transition={reduceAware(reduced, springs.grand, { duration: 0.16 })}
      role="group"
      aria-labelledby={titleId}
      data-testid="approval-card"
      data-approval-status={expired && status === "pending" ? "expired" : status}
    >
      <div className="approval-head">
        <span className="approval-icon" aria-hidden="true">
          {status === "succeeded" ? <Check /> : status === "cancelled" ? <X /> : busy ? <Loader2 className="spin" /> : <ShieldAlert />}
        </span>
        <div>
          <span className="approval-kicker">{statusCopy.label}</span>
          <h3 id={titleId}>{humanizeTool(block.tool)}</h3>
        </div>
      </div>

      <p className="approval-effect" data-testid="approval-effect">
        <strong>Connected change:</strong> {approval.effect}
      </p>
      {(status === "pending" || busy) && <p className="approval-message">{approval.message}</p>}
      <div className="approval-expiry">
        <Clock aria-hidden="true" />
        <span>Expires {approvalExpiryLabel(approval.expiresAt)}</span>
      </div>

      <button
        className="approval-review"
        type="button"
        onClick={() => setReviewOpen((open) => !open)}
        aria-expanded={reviewOpen}
        aria-controls={detailId}
      >
        <span>Review exact arguments</span>
        <motion.span animate={{ rotate: reviewOpen ? 180 : 0 }} transition={springs.quick}>
          <ChevronDown aria-hidden="true" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {reviewOpen && (
          <motion.div
            className="approval-review-detail"
            id={detailId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduced ? 0.08 : 0.28 }}
          >
            <span>Arguments sent if approved</span>
            <pre data-testid="approval-arguments">{exactInput}</pre>
            {exactResult && !["pending", "approving", "cancelling", "approved", "executing"].includes(status) && (
              <>
                <span>Result</span>
                <pre data-testid="approval-result">{exactResult}</pre>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {approvalError && <p className="approval-error">{approvalError}</p>}
      <ApprovalAnnouncement label={statusCopy.label} detail={statusCopy.detail} assertive={pending} />

      <div className="approval-actions">
        <button
          className="approval-cancel"
          type="button"
          disabled={!pending}
          onClick={() => decideApproval(messageId, block.id, "cancel")}
          aria-label="Cancel action"
        >
          <X aria-hidden="true" />
          Cancel
        </button>
        <button
          className="approval-approve"
          type="button"
          disabled={!pending}
          onClick={() => decideApproval(messageId, block.id, "approve")}
          aria-label="Approve action"
        >
          {busy ? <Loader2 className="spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
          Approve
        </button>
      </div>
      <p className="approval-state-copy">{statusCopy.detail}</p>
    </motion.article>
  );
}

export function ActionBlock({ block, messageId }) {
  if (block.approval) return <ApprovalCard block={block} messageId={messageId} />;
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
