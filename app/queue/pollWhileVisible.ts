// Interval polling that goes quiet while the tab is hidden (phones in
// pockets, backgrounded tabs) and fires immediately when the tab comes back,
// so returning users never see stale state.
export function startVisiblePolling(
  fn: () => void | Promise<unknown>,
  intervalMs: number | (() => number)
): () => void {
  // One tick at a time: without this, a slow response can resolve after a
  // faster later one and apply an older snapshot — on the display that
  // changes the iframe key and restarts/flashes the wrong video.
  let inFlight = false;
  const run = (): Promise<unknown> | undefined => {
    if (inFlight) return;
    const result = fn();
    if (result && typeof result.then === "function") {
      inFlight = true;
      return result.then(
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
    return run();
  };
  const nextDelay = () => (typeof intervalMs === "function" ? intervalMs() : intervalMs);
  // Read the next delay after the response lands, or a pace change applies one tick late.
  let stopped = false;
  const schedule = () => {
    if (!stopped) timer = setTimeout(loop, nextDelay());
  };
  function loop() {
    const pending = tick();
    if (pending) pending.then(schedule, schedule);
    else schedule();
  }
  let timer = setTimeout(loop, nextDelay());

  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") run();
  };
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }

  return () => {
    stopped = true;
    clearTimeout(timer);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  };
}
