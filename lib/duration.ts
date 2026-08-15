// YouTube's videos.list reports durations as ISO 8601 (e.g. "PT3M45S",
// "PT1H2M3S"). Months/years never appear in video durations, so only
// days/hours/minutes/seconds are parsed.
export function parseIso8601Duration(iso: string): number | undefined {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso);
  if (!match || (!match[1] && !match[2] && !match[3] && !match[4])) return undefined;
  const [, d, h, m, s] = match;
  return (
    Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0)
  );
}

// 225 → "3:45", 3723 → "1:02:03" — the YouTube thumbnail-badge format.
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** The single place the time.* keys are dispatched, so a locale that adds real
 * plural forms is taught once and every duration surface picks it up. */
export function formatHoursMinutes(totalMinutes: number, t: Translate): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return t("time.hoursMinutes", { hours, minutes });
  if (hours > 0) return t("time.hours", { count: hours });
  return t("time.minutes", { count: minutes });
}

/** Rounded UP, unlike a queue ETA (see roundEtaSeconds): a quota reset is a
 * hard deadline, and rounding down makes the app wrong once the clock passes. */
export function formatCountdown(seconds: number, t: Translate): string {
  return formatHoursMinutes(Math.max(1, Math.ceil(seconds / 60)), t);
}
