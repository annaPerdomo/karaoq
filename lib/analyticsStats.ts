// Pure helpers for the analytics dashboard aggregations. Kept free of Mongo /
// Next.js imports so they can be unit-tested directly.

export interface FunnelRoom {
  searches: number;
  songs: number;
  minutesToFirstSong: number | null;
}

export interface FunnelSummary {
  roomsCreated: number;
  roomsSearched: number;
  roomsWithSong: number;
  roomsEngaged: number;
  medianMinutesToFirstSong: number | null;
  p90MinutesToFirstSong: number | null;
}

// Rooms with at least this many songs count as "engaged" in the funnel.
export const ENGAGED_SONG_COUNT = 3;

export function resolveTimezone(tz: unknown): string {
  if (typeof tz !== "string" || !tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const value = sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  return Math.round(value * 10) / 10;
}

export function median(values: number[]): number | null {
  return percentile(values, 0.5);
}

const HISTOGRAM_BUCKETS = [
  { label: "0 songs", min: 0, max: 0 },
  { label: "1–2", min: 1, max: 2 },
  { label: "3–5", min: 3, max: 5 },
  { label: "6–10", min: 6, max: 10 },
  { label: "11+", min: 11, max: Infinity },
];

// perRoomCounts only contains rooms that added at least one song; rooms that
// never added a song are inferred from the total room count.
export function buildSongsHistogram(
  perRoomCounts: number[],
  totalRooms: number
): { label: string; count: number }[] {
  const zeroRooms = Math.max(0, totalRooms - perRoomCounts.length);
  return HISTOGRAM_BUCKETS.map((b) => ({
    label: b.label,
    count:
      b.min === 0
        ? zeroRooms
        : perRoomCounts.filter((c) => c >= b.min && c <= b.max).length,
  }));
}

export function summarizeFunnel(rooms: FunnelRoom[]): FunnelSummary {
  const timings = rooms
    .map((r) => r.minutesToFirstSong)
    .filter((m): m is number => typeof m === "number" && m >= 0);
  return {
    roomsCreated: rooms.length,
    // Songs can only be added through the search UI, so a room with songs has
    // implicitly searched — rooms predating the search_performed event would
    // otherwise make this step read lower than the next one.
    roomsSearched: rooms.filter((r) => r.searches > 0 || r.songs > 0).length,
    roomsWithSong: rooms.filter((r) => r.songs > 0).length,
    roomsEngaged: rooms.filter((r) => r.songs >= ENGAGED_SONG_COUNT).length,
    medianMinutesToFirstSong: median(timings),
    p90MinutesToFirstSong: percentile(timings, 0.9),
  };
}

export interface LinkLookupRow {
  _id: { src?: string | null; lookupOutcome?: string | null };
  count: number;
}

export interface LinkLookupSummary {
  total: number;
  bySrc: { _id: string; count: number }[];
  byOutcome: { _id: string; count: number }[];
}

/**
 * Folds the one (src × outcome) aggregation into the two breakdowns and the
 * total /admin shows. Derived rather than queried three times: one 30-day scan
 * of link_lookup answers all three, and the numbers can't disagree.
 *
 * Rows written before a field existed group under "unknown" rather than
 * vanishing, so the breakdowns always sum to the total.
 */
export function summarizeLinkLookups(rows: LinkLookupRow[]): LinkLookupSummary {
  const bySrc = new Map<string, number>();
  const byOutcome = new Map<string, number>();
  let total = 0;
  for (const row of rows) {
    const count = row.count ?? 0;
    total += count;
    const src = row._id?.src || "unknown";
    const outcome = row._id?.lookupOutcome || "unknown";
    bySrc.set(src, (bySrc.get(src) ?? 0) + count);
    byOutcome.set(outcome, (byOutcome.get(outcome) ?? 0) + count);
  }
  const toSorted = (m: Map<string, number>) =>
    Array.from(m, ([_id, count]) => ({ _id, count })).sort(
      (a, b) => b.count - a.count
    );
  return { total, bySrc: toSorted(bySrc), byOutcome: toSorted(byOutcome) };
}
