const HEARTBEAT_INTERVAL = 60000; // 60 seconds

export function startSessionTracking(
  roomId: string,
  userName: string,
  role: "host" | "singer" | "display"
): () => void {
  const send = () => {
    fetch("/api/analytics/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, userName, role }),
    }).catch(() => {});
  };

  // Fire immediately on session start
  send();

  const interval = setInterval(send, HEARTBEAT_INTERVAL);
  return () => clearInterval(interval);
}
