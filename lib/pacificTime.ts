function secondsIntoPacificDay(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const part = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return (part("hour") % 24) * 3600 + part("minute") * 60 + part("second");
}

// The daily quota resets at midnight Pacific, which is what YouTube bills
// against regardless of where the singer is.
export function quotaResetsAt(now: Date = new Date()): string {
  // Adding the seconds left in the day only lands on midnight when the day is
  // 24 hours long; the two DST transitions make it 23 or 25, missing by exactly
  // an hour. Snapping to the nearer midnight corrects both directions.
  let t = now.getTime() + (86400 - secondsIntoPacificDay(now)) * 1000;
  const drift = secondsIntoPacificDay(new Date(t));
  if (drift !== 0) t += (drift > 43200 ? 86400 - drift : -drift) * 1000;
  return new Date(t).toISOString();
}

/** The same instant as quotaResetsAt in epoch ms, for callers holding a clock
 *  rather than rendering a time. */
export function quotaResetsAtMs(now: Date = new Date()): number {
  return new Date(quotaResetsAt(now)).getTime();
}

// The quota day is Pacific regardless of the singer's timezone; this key
// names it, e.g. "2026-08-07". en-CA locale gives ISO YYYY-MM-DD directly.
export function pacificDayKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
