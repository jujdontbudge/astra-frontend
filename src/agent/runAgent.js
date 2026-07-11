import { callAnthropic } from "./anthropic.js";
import { callJarvis } from "./jarvis.js";

// Two ways to run:
//   "jarvis"    — talk to the local RovaOS/Jarvis backend over WebSocket (key on server).
//   "anthropic" — bring-your-own-key, stream straight from the browser to Anthropic.
export async function runAgent({ settings, text, mode, history, sessionId, onEvent, signal }) {
  if (settings?.backend === "jarvis") {
    return callJarvis({
      baseUrl: settings.jarvisUrl,
      sessionId,
      text,
      onEvent,
      signal,
    });
  }

  const apiKey = settings?.apiKey?.trim();
  if (!apiKey) {
    throw new Error("Add your Anthropic API key in Settings to start.");
  }
  return callAnthropic({
    apiKey,
    model: settings.model,
    mode,
    history,
    onEvent,
    signal,
  });
}

// Whether the app is configured enough to send a message.
export function isReady(settings) {
  if (settings?.backend === "jarvis") return true;
  return Boolean(settings?.apiKey?.trim());
}

export function isUsingRealModel(settings) {
  return isReady(settings);
}
