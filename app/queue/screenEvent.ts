/** Fire-and-forget telemetry for a client-only moment the music-video screen
 * can't attribute to a room write. keepalive so a `pagehide` send survives
 * the tab closing. */
export default function postScreenEvent(
  roomId: string,
  type: string,
  data: Record<string, unknown>
): void {
  try {
    fetch("/api/analytics/screen-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, type, data }),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}
