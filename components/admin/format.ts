// Pure formatting helpers shared across the admin views. English-only by
// design: the dashboard is a single-operator surface (see the i18n note in
// CLAUDE.md — the product is translated, the admin deliberately isn't).

export const SOURCE_LABELS: Record<string, string> = {
  random: 'Random button',
  song_pick: 'Song picks',
  genre_chip: 'Genre chips',
  trending: 'Trending',
};

export const SECTION_LABELS: Record<string, string> = {
  genre: 'Genre',
  'voice-type': 'Voice type',
  spanish: 'Spanish',
  kpop: 'K-Pop',
  japanese: 'Japanese',
};

export const VIA_LABELS: Record<string, string> = {
  search: 'Search',
  paste: 'Pasted link',
  board_claim: 'Request board',
  singwithme: 'Sing with me',
};

export const ERROR_SOURCE_LABELS: Record<string, string> = {
  window: 'Uncaught error',
  promise: 'Unhandled rejection',
};

// The five real (failReason, searchOutcome) combinations — see /api/search.
export const SEARCH_FAIL_LABELS: Record<string, string> = {
  'quota:stale': 'Quota spent — served stale cache',
  'quota:error': 'Quota spent — nothing to serve',
  'upstream:stale': 'YouTube down — served stale cache',
  'upstream:error': 'YouTube down — nothing to serve',
  'rate_limited:error': 'Caller rate-limited',
};

export function searchFailLabel(
  failReason: string | null,
  searchOutcome: string | null
): string {
  const key = `${failReason ?? '?'}:${searchOutcome ?? '?'}`;
  return SEARCH_FAIL_LABELS[key] ?? key;
}

// Read as a run-on line ("38 found · 3 bad link"), so these stay lowercase.
export const LOOKUP_OUTCOME_LABELS: Record<string, string> = {
  hit: 'found',
  not_found: 'bad link',
  not_embeddable: 'blocked',
};

/** Unrecognised outcomes are appended rather than dropped. */
export function lookupOutcomeParts(
  byOutcome: { _id: string; count: number }[]
): string[] {
  const counts = new Map(byOutcome.map((o) => [o._id, o.count]));
  const known = Object.keys(LOOKUP_OUTCOME_LABELS);
  const ordered = [
    ...known,
    ...byOutcome.map((o) => o._id).filter((id) => !known.includes(id)),
  ];
  return ordered
    .filter((id) => (counts.get(id) ?? 0) > 0)
    .map((id) => `${counts.get(id)} ${LOOKUP_OUTCOME_LABELS[id] ?? id}`);
}

// Mongo's $dayOfWeek: 1 = Sunday … 7 = Saturday
export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** decodeURIComponent throws on stray '%' sequences in raw geo header values. */
export function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function viewerTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export function formatHour(h: number): string {
  if (h === 0) return '12am';
  if (h < 12) return `${h}am`;
  if (h === 12) return '12pm';
  return `${h - 12}pm`;
}

/** "3m ago" / "2h ago" / "5d ago"; "" for bad input. */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return '';
  const mins = Math.max(0, Math.round((Date.now() - at) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** A session heartbeat this recent means someone is in the room right now. */
export const LIVE_WINDOW_MS = 30 * 60 * 1000;

export function isLive(lastSeen: string | null | undefined): boolean {
  if (!lastSeen) return false;
  const at = new Date(lastSeen).getTime();
  return Number.isFinite(at) && Date.now() - at < LIVE_WINDOW_MS;
}

/** "US" → 🇺🇸. Anything that isn't two ASCII letters gets no flag. */
export function countryFlag(code: string | null | undefined): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return '';
  const base = 0x1f1e6 - 65;
  const upper = code.toUpperCase();
  return String.fromCodePoint(
    base + upper.charCodeAt(0),
    base + upper.charCodeAt(1)
  );
}

export function fillHours(
  rows: { _id: number; count: number }[]
): { label: string; value: number }[] {
  if (rows.length === 0) return [];
  const byHour = new Map(rows.map((r) => [r._id, r.count]));
  return Array.from({ length: 24 }, (_, h) => ({
    label: formatHour(h),
    value: byHour.get(h) ?? 0,
  }));
}

/**
 * Hour-of-day totals from the weekday × hour grid. Derived rather than queried
 * so "Peak hours" and "When the party happens" can't disagree about what counts
 * as activity — and so the server runs one 30-day scan instead of two.
 */
export function hoursFromGrid(
  grid: { _id: { dow: number; hour: number }; count: number }[]
): { _id: number; count: number }[] {
  const byHour = new Map<number, number>();
  for (const cell of grid) {
    byHour.set(cell._id.hour, (byHour.get(cell._id.hour) ?? 0) + cell.count);
  }
  return Array.from(byHour, ([_id, count]) => ({ _id, count })).sort(
    (a, b) => a._id - b._id
  );
}

export function fillWeekdays(
  rows: { _id: number; count: number }[]
): { label: string; value: number }[] {
  if (rows.length === 0) return [];
  const byDay = new Map(rows.map((r) => [r._id, r.count]));
  return WEEKDAY_LABELS.map((label, i) => ({
    label,
    value: byDay.get(i + 1) ?? 0,
  }));
}

export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}
