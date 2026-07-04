// Fired from the display's pagehide handler. Uses sendBeacon so the request
// survives the tab being torn down (a normal fetch would be cancelled). Falls
// back to a keepalive fetch where sendBeacon is unavailable.
export default function postDisplayGone(roomId: string): void {
  const url = `/api/queue/${roomId}/display-gone`;
  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(url);
      return;
    }
  } catch {}
  try {
    fetch(url, { method: "POST", keepalive: true }).catch(() => {});
  } catch {}
}
