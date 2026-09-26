// Interval polling that goes quiet while the tab is hidden (phones in
// pockets, backgrounded tabs) and fires immediately when the tab comes back,
// so returning users never see stale state.
export function startVisiblePolling(
  fn: () => void | Promise<unknown>,
  // A function is re-read before every tick, so a poll can change its own pace.
  intervalMs: number | (() => number)
): () => void {
  // One tick at a time: without this, a slow response can resolve after a
  // faster later one and apply an older snapshot — on the display that
  // changes the iframe key and restarts/flashes the wrong video.
  let inFlight = false;
  const run = () => {
    if (inFlight) return;
    const result = fn();
    if (result && typeof result.then === "function") {
      inFlight = true;
      result.then(
        () => {
          inFlight = false;
        },
        () => {
          inFlight = false;
        }
      );
    }
  };

  const tick = () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    run();
  };
  const nextDelay = () => (typeof intervalMs === "function" ? intervalMs() : intervalMs);
  let timer = setTimeout(function loop() {
    tick();
    timer = setTimeout(loop, nextDelay());
  }, nextDelay());

  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") run();
  };
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }

  return () => {
    clearTimeout(timer);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  };
}
