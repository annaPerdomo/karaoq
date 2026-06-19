const HEARTBEAT_INTERVAL = 60000; // 60 seconds

function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    // fall through to the time/random id
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Per-tab fallback for when localStorage is blocked (private mode). Generated
// once so storage-blocked users don't all collapse into one shared session.
let fallbackClientId: string | null = null;

// A stable per-browser id so a session is counted once regardless of how many
// times the user edits their name. Without this, every keystroke in the name
// field upserted a new analytics_sessions doc, massively inflating head counts.
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
    fetch("/api/analytics/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, userName, role, clientId }),
    }).catch(() => {});
  };

  // Fire immediately on session start
  send();

  const interval = setInterval(send, HEARTBEAT_INTERVAL);
  return () => clearInterval(interval);
}
