export function ytCommand(
  iframe: HTMLIFrameElement | null,
  func: string,
  args: unknown[] = []
): void {
  iframe?.contentWindow?.postMessage(
    JSON.stringify({ event: "command", func, args }),
    "https://www.youtube.com"
  );
}

export interface YtMessage {
  event: string;
  info?: any;
}

export function parseYtMessage(
  e: MessageEvent,
  iframe: HTMLIFrameElement | null
): YtMessage | null {
  if (e.origin !== "https://www.youtube.com") return null;
  if (iframe && e.source !== iframe.contentWindow) return null;
  try {
    const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
    if (!data || typeof data.event !== "string") return null;
    return { event: data.event, info: data.info };
  } catch {
    return null;
  }
}

/** True at most once per `intervalMs`, advancing `state.last` as a side
 * effect — callers keep `state` in a ref so the throttle survives renders. */
export function throttled(
  state: { last: number },
  nowMs: number,
  intervalMs: number
): boolean {
  if (nowMs - state.last < intervalMs) return false;
  state.last = nowMs;
  return true;
}
