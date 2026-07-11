import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { safeJSONParse, safeStorageGet, safeStorageSet } from "../lib/utils.js";

const STORAGE_KEY = "rovaos.settings.v2";

export const MODELS = [
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { id: "claude-opus-4-8", label: "Claude Opus 4.8" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
];

const DEFAULTS = {
  backend: "jarvis",
  jarvisUrl: "ws://localhost:8888",
  apiKey: "",
  model: "claude-sonnet-4-6",
  mode: "Build",
};

const SettingsContext = createContext(null);

function load() {
  const restored = safeJSONParse(safeStorageGet(STORAGE_KEY), {});
  return { ...DEFAULTS, ...restored, apiKey: "" };
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(load);

  useEffect(() => {
    const { apiKey: _sessionOnlyKey, ...persisted } = settings;
    safeStorageSet(STORAGE_KEY, JSON.stringify(persisted));
  }, [settings]);

  const value = useMemo(
    () => ({
      settings,
      update: (patch) => setSettings((prev) => ({ ...prev, ...patch })),
      setMode: (mode) => setSettings((prev) => ({ ...prev, mode })),
    }),
    [settings]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
