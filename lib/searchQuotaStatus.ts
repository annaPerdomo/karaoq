import { getOpsAlertsCollection } from "./mongodb";
import { pacificDayKey, quotaResetsAt } from "./pacificTime";

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

/**
 * ISO time today's spent search quota frees up, or null while search is fine.
 * Never throws — a status read must not take down the room poll it rides on.
 */
export async function searchQuotaResetsAt(): Promise<string | null> {
  const day = pacificDayKey();
  if (!cache || cache.day !== day || Date.now() - cache.at >= CACHE_MS) {
    try {
      const alerts = await getOpsAlertsCollection();
      // The alert-mutex doc counts too, so a trip recorded before the
      // dedicated marker shipped still lights the flag that same evening.
      const doc = await alerts.findOne({
        _id: { $in: [`quota-out:${day}`, `quota:${day}`] },
      });
      cache = { day, out: !!doc, at: Date.now() };
    } catch (e) {
      console.warn("Search quota status read failed:", e);
      // Same-day cache older than the TTL still beats guessing.
      if (!cache || cache.day !== day) return null;
    }
  }
  return cache.out ? quotaResetsAt() : null;
}
