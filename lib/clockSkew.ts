/**
 * Every ETA is the gap between a server-stamped instant (playStartedAt) and the
 * viewer's own clock, so a phone running a minute slow reports the song on
 * stage as barely started and one running fast reports it as already over.
 * Each room read carries the server's clock; we answer "now" in its terms.
 */

// Biased late by the response's transit time — tens of milliseconds against
// estimates rounded to minutes.
let offsetMs = 0;

/** Fed by every room read. Ignores a response that predates the field. */
export function recordServerTime(serverNow: unknown): void {
  if (typeof serverNow !== "number" || !Number.isFinite(serverNow)) return;
  offsetMs = serverNow - Date.now();
}

/** Date.now() corrected onto the server's clock. */
export function serverNow(): number {
  return Date.now() + offsetMs;
}

/** Tests only — module state would otherwise leak between cases. */
export function resetClockSkew(): void {
  offsetMs = 0;
}
