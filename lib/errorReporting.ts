// Client-side crash reporter. Installed once from _app; posts uncaught errors
// and unhandled promise rejections to /api/analytics/error so the admin's
// Errors view can show what actually breaks in the field. Server-side
// exemptions (localhost, demo traffic) still apply — see isAnalyticsExempt.

const ENDPOINT = "/api/analytics/error";

// One report per distinct message per minute, and a hard per-page-load cap: a
// render loop that throws on every frame must cost one document, not thousands.
const PER_MESSAGE_COOLDOWN_MS = 60_000;
const MAX_REPORTS_PER_LOAD = 20;

let installed = false;
let reportsSent = 0;
const lastSentByMessage = new Map<string, number>();

/**
 * The room pages are /host/:code, /sing/:code, /display/:code. Uppercased
 * because room codes are case-insensitive and every other collection stores the
 * canonical form (lib/roomCode.ts) — a lowercase key here would hide the error
 * from the room's dossier and survive that room's delete.
 */
export function roomIdFromPath(pathname: string): string {
  const match = pathname.match(/^\/(?:host|sing|display)\/([^/?#]+)/);
  return match ? match[1].toUpperCase() : "";
}

/**
 * Cross-origin and browser-extension failures reach us as this, with no stack
 * and no actionable page. Grouping is by message, so one of these would outrank
 * every real bug in the Errors view.
 */
function isOpaqueThirdPartyError(text: string, stack?: unknown): boolean {
  return !stack && /^script error\.?$/i.test(text.trim());
}

// Safari's stackless WebExtension failure; our code never calls the extension runtime.
const EXTENSION_API_MESSAGE = /^Invalid call to runtime\.\w+\(\)/;

const EXTENSION_URL = /\b(?:chrome|moz|safari|safari-web)-extension:\/\//;
const HTTP_URL = /https?:\/\/[^\s)]+/;
// V8 frames start with "at "; Firefox/Safari frames are "fn@url:line:col".
const FRAME_LINE = /^\s*at\s|@\S+:\d+/;
// Off-origin but ours: usePlaybackError injects YouTube's iframe_api, so a
// www-widgetapi.js frame is a mount-order or teardown bug we own.
const OWNED_THIRD_PARTY = /^https:\/\/(?:www\.)?youtube\.com\//;
// An injected script has a position but no URL. Bare "<anonymous>" is a V8
// native frame (Array.map, new Promise) and appears in first-party stacks.
const INJECTED_FRAME = /<anonymous>:\d+/;
// Safari attributes an extension's content script to the page URL itself
// ("global code@https://www.karaoq.live/sing/ABCDE:1:12"). Our own code only
// ever runs from /_next/ bundles or a .js file — the one inline script we ship
// (_document's TV flag) is wrapped in try/catch and cannot throw.
const OWN_SCRIPT_PATH = /\/_next\/|\.m?js\b/;

/** A fetch-wrapping extension throws from its own frame. A native error we caused
 *  inside the wrapper is lost too, but only for users running that extension. */
export function isThrownByExtension(stack: unknown): boolean {
  if (typeof stack !== "string") return false;
  const top = stack.split("\n").find((line) => FRAME_LINE.test(line));
  return !!top && EXTENSION_URL.test(top);
}

/**
 * Drops extension, injected-script and other-origin noise that would otherwise
 * outrank every real bug in the Errors view. A frame we can't place counts as
 * ours, so only an entirely foreign stack is dropped — bias is toward reporting.
 */
export function isForeignStack(stack: unknown, origin: string): boolean {
  if (typeof stack !== "string") return false;
  const frames = stack.split("\n").filter((line) => FRAME_LINE.test(line));
  if (frames.length === 0) return false;
  return frames.every((line) => {
    if (EXTENSION_URL.test(line)) return true;
    const url = line.match(HTTP_URL)?.[0];
    if (url) {
      if (OWNED_THIRD_PARTY.test(url)) return false;
      if (!url.startsWith(origin)) return true;
      return !OWN_SCRIPT_PATH.test(url.slice(origin.length));
    }
    return INJECTED_FRAME.test(line);
  });
}

export function reportClientError(
  source: "window" | "promise",
  message: unknown,
  stack?: unknown
): void {
  if (typeof window === "undefined") return;
  const text = typeof message === "string" ? message : String(message ?? "");
  if (!text) return;
  if (isOpaqueThirdPartyError(text, stack)) return;
  if (EXTENSION_API_MESSAGE.test(text)) return;
  if (isThrownByExtension(stack)) return;
  if (isForeignStack(stack, window.location.origin)) return;

  if (reportsSent >= MAX_REPORTS_PER_LOAD) return;
  const key = `${source}:${text}`;
  const now = Date.now();
  const last = lastSentByMessage.get(key);
  if (last !== undefined && now - last < PER_MESSAGE_COOLDOWN_MS) return;
  lastSentByMessage.set(key, now);
  reportsSent += 1;

  try {
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // keepalive lets a report from a crashing/unloading page still leave.
      keepalive: true,
      body: JSON.stringify({
        message: text,
        stack: typeof stack === "string" ? stack : undefined,
        source,
        page: window.location.pathname,
        roomId: roomIdFromPath(window.location.pathname),
      }),
    }).catch(() => {});
  } catch {
    // Reporting must never throw into the page that is already failing.
  }
}

export function installErrorReporting(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    const error = event.error as { stack?: string } | undefined;
    reportClientError("window", event.message || String(event.error), error?.stack);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason as { name?: string; message?: string; stack?: string } | null;
    // Every fetch of ours catches its abort; one that surfaces was re-chained by a
    // fetch-wrapping extension, and its stack names only our code.
    if (reason?.name === "AbortError") return;
    reportClientError(
      "promise",
      reason && typeof reason.message === "string" ? reason.message : String(reason),
      reason?.stack
    );
  });
}
