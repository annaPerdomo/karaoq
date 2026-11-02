import {
  DAY_CALL_QUOTA,
  UNBILLED_SLACK_CALLS,
  callsLeft,
  markDailyOut,
  recordSpend,
  searchesLeft,
  spentToday,
} from "./corpusBudget";
import { pacificDayKey, quotaResetsAt } from "./pacificTime";

/** Env override shared with the cron (YOUTUBE_DAY_CALLS), calls per Pacific day. */
export function dayQuota(): number {
  const n = Number(process.env.YOUTUBE_DAY_CALLS);
  return Number.isFinite(n) && n > 0 ? n : DAY_CALL_QUOTA;
}

// Room polls are the hottest path in the app, so the Mongo read behind this
// is memoized: one findOne per instance per window. The cache is keyed by the
// Pacific day, which means it can never hold "quota out" across midnight —
// the moment the day key flips, the stale entry misses and the flag clears.
const CACHE_MS = 30_000;
let cache: { day: string; out: boolean; at: number } | null = null;

/** Test seam: module state outlives a `vi.clearAllMocks()`. */
export function resetSearchQuotaStatusCache(): void {
  cache = null;
}

export async function searchQuotaSpent(): Promise<boolean> {
  const out = Boolean((await spentToday(Date.now())).dailyOutAt);
  cache = { day: pacificDayKey(), out, at: Date.now() };
  return out;
}

/** A "per day" refusal is believed only within UNBILLED_SLACK_CALLS of the
 *  line (ledger unreadable: YouTube's word stands). A believed one bills the
 *  shortfall — nothing else bills once every call is refused, and the memo
 *  would otherwise read "one left" until midnight. */
export async function confirmDailyOut(limit: "burst" | "daily" | null): Promise<boolean> {
  if (limit !== "daily") return false;
  try {
    const now = Date.now();
    const spent = await spentToday(now);
    const quota = dayQuota();
    const out = callsLeft(spent, quota) <= UNBILLED_SLACK_CALLS;
    if (out) {
      const short = searchesLeft(spent, quota);
      if (short > 0) await recordSpend(now, { searches: short, unloggedSearches: short });
      if (!spent.dailyOutAt) await markDailyOut(now);
    }
    cache = { day: pacificDayKey(), out, at: now };
    return out;
  } catch (e) {
    console.warn("Search quota ledger read failed:", e);
    return true;
  }
}

/**
 * ISO time today's spent search quota frees up, or null while search is fine.
 * Never throws — a status read must not take down the room poll it rides on.
 */
export async function searchQuotaResetsAt(): Promise<string | null> {
  const day = pacificDayKey();
  if (!cache || cache.day !== day || Date.now() - cache.at >= CACHE_MS) {
    try {
      await searchQuotaSpent();
    } catch (e) {
      console.warn("Search quota status read failed:", e);
      // Same-day cache older than the TTL still beats guessing.
      if (!cache || cache.day !== day) return null;
    }
  }
  return cache?.out ? quotaResetsAt() : null;
}
