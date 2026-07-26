import { getActiveLocale } from "../../lib/i18n/activeLocale";

const HEARTBEAT_INTERVAL = 60000;

function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Per-tab fallback when localStorage is blocked, so those users don't collapse into one shared session.
let fallbackClientId: string | null = null;

// Stable per-browser id so name edits don't upsert new analytics_sessions docs.
function getClientId(): string {
  try {
    const KEY = "karaoq_client_id";
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    if (!fallbackClientId) fallbackClientId = randomId();
    return fallbackClientId;
  }
}

export function startSessionTracking(
  roomId: string,
  userName: string,
  role: "host" | "singer" | "display"
): () => void {
  const clientId = getClientId();

  const send = () => {
    // Read locale per beat: detection resolves post-mount and can change mid-room; last write wins.
    const { locale, source } = getActiveLocale();
    fetch("/api/analytics/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, userName, role, clientId, locale, localeSource: source }),
    }).catch(() => {});
  };

  send();

  const interval = setInterval(send, HEARTBEAT_INTERVAL);
  return () => clearInterval(interval);
}
