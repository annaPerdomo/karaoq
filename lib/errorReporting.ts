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

export function reportClientError(
  source: "window" | "promise",
  message: unknown,
  stack?: unknown
): void {
  if (typeof window === "undefined") return;
  const text = typeof message === "string" ? message : String(message ?? "");
  if (!text) return;
  if (isOpaqueThirdPartyError(text, stack)) return;

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
    const reason = event.reason as { message?: string; stack?: string } | null;
    reportClientError(
      "promise",
      reason && typeof reason.message === "string" ? reason.message : String(reason),
      reason?.stack
    );
  });
}
