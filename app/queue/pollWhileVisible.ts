// Interval polling that goes quiet while the tab is hidden (phones in
// pockets, backgrounded tabs) and fires immediately when the tab comes back,
// so returning users never see stale state.
export function startVisiblePolling(fn: () => void, intervalMs: number): () => void {
  const tick = () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    fn();
  };
  const interval = setInterval(tick, intervalMs);

  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") fn();
  };
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }

  return () => {
    clearInterval(interval);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  };
}
