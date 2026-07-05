import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Small shared helpers.

export function uid(prefix = "id") {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function formatTime(ts) {
  const date = ts instanceof Date ? ts : new Date(ts);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function cn(...parts) {
  return twMerge(clsx(parts));
}

export function cx(...parts) {
  return cn(...parts);
}

export function truncate(str, max = 42) {
  const clean = String(str).trim().replace(/\s+/g, " ");
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

// Reject when an AbortSignal fires, so agent runs can be interrupted cleanly.
export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener?.("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(abortError());
    }
    signal?.addEventListener?.("abort", onAbort, { once: true });
  });
}

export function abortError() {
  const err = new Error("Aborted");
  err.name = "AbortError";
  return err;
}

export function safeJSONParse(value, fallback) {
  try {
    return value == null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function safeStorageGet(key, fallback = null) {
  try {
    const value = localStorage.getItem(key);
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

export function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function parseMaybeJSON(value) {
  if (value == null) return {};
  if (typeof value === "object") return value;
  if (typeof value !== "string") return { value };
  try {
    return JSON.parse(value);
  } catch {
    return { text: value };
  }
}

export function clampText(value, max = 120) {
  const clean = String(value ?? "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}...` : clean;
}
