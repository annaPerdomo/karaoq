import { NextApiRequest, NextApiResponse } from "next";
import { getAnalyticsDb } from "../../../lib/mongodb";
import { suggestionCatalog } from "../../../lib/suggestionCatalog";
import {
  pendingEntries,
  pinPopularPicks,
  thinEntries,
  refreshStale,
  resolveBySearch,
  seedFromAdds,
  seedFromKaraokeChannels,
  seedFromSearchCache,
  type ResolveReport,
} from "../../../lib/suggestionResolver";
import { buildSearchQuery, searchCacheKey } from "../../../lib/searchQuery";
import { THIN_RESULTS } from "../../../lib/suggestionVideos";

// Nightly, not monthly: the quota is a *daily* allowance, so a monthly pass
// could only ever spend one day's worth.
const DEFAULT_RESOLVE_PER_RUN = 40;

// Entries are refreshed well before their 30-day retention TTL, so a run that
// fails or is skipped has a fortnight of slack before anything expires.
const REFRESH_AFTER_DAYS = 16;
const REFRESH_PER_RUN = 400;

// A *total*, not a per-channel cap: 35 channels × 400 pages each was a
// 14,035-unit ceiling against a 10,000/day pool, so the step built to protect
// the quota could spend all of it and take every room's searches down with it.
// 800 pages is ~835 units and ~40,000 uploads a night, walked from a saved
// cursor so successive nights reach the deep end.
const CHANNEL_PAGES = 800;
const CHANNEL_PAGES_PER_CHANNEL = 60;
const CUTS_PER_SONG = 8;

const CHANNEL_RESWEEP_MS = 14 * 24 * 60 * 60 * 1000;

// The function's ceiling, with the sweep's deadline held under it: work is
// persisted per channel, so stopping voluntarily keeps what was bought where
// being killed mid-sweep spent the units and wrote nothing.
export const config = { maxDuration: 300 };
const RUN_BUDGET_MS = 240_000;
const CHANNEL_DEADLINE_MS = 150_000;

function envCount(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * A suggestion_used event records the romanised title and artist, but the
 * catalog keys on buildSongQuery, which prefers native script. Rebuilding the
 * key from the event fields matched nothing at all for ja/ko/in — silently.
 */
function catalogKeyByRomanisedName(): Map<string, string> {
  const index = new Map<string, string>();
  for (const entry of Array.from(suggestionCatalog().values())) {
    const romanised = searchCacheKey(
      buildSearchQuery(`${entry.artist} ${entry.title}`, true)
    );
    index.set(romanised, entry.key);
  }
  return index;
}

/** Our own event data — no YouTube fields, so no retention window applies. */
async function suggestionDemand(): Promise<Map<string, number>> {
  const demand = new Map<string, number>();
  const byRomanisedName = catalogKeyByRomanisedName();
  try {
    const db = await getAnalyticsDb();
    const rows = await db
      .collection("analytics_events")
      .aggregate<{ _id: { title?: string; artist?: string }; count: number }>([
        { $match: { type: "suggestion_used", songTitle: { $exists: true } } },
        {
          $group: {
            _id: { title: "$songTitle", artist: "$songArtist" },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 2000 },
      ])
      .toArray();
    for (const row of rows) {
      const { title, artist } = row._id;
      if (!title) continue;
      const key = byRomanisedName.get(
        searchCacheKey(buildSearchQuery(`${artist ?? ""} ${title}`, true))
      );
      if (!key) continue; // a song that has since left the catalog
      demand.set(key, (demand.get(key) ?? 0) + row.count);
    }
  } catch {
    // No demand data just means the catalog resolves in its natural order.
  }
  return demand;
}

/** Cheapest source first, so a day whose search quota is already spent still
 *  makes progress on everything before the last step. */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Closed rather than open when unset, so a missing env var can't publish a
  // route that spends the API quota.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ code: 401, message: "Unauthorized." });
    return;
  }

  // ?search=0 runs only the steps that don't touch search.list. Everything
  // else still does real work, so a maxed-out day isn't a no-op.
  const useSearch = req.query.search !== "0";

  const started = Date.now();
  const demand = await suggestionDemand();
  let pending = await pendingEntries(demand);

  const fromCache = await seedFromSearchCache(pending);
  if (fromCache.seeded > 0) {
    const seeded = new Set(fromCache.keys);
    pending = pending.filter((e) => !seeded.has(e.key));
  }

  const fromAdds = await seedFromAdds(pending);
  if (fromAdds.seeded > 0) pending = await pendingEntries(demand);

  const fromChannels = await seedFromKaraokeChannels(pending, {
    totalPages: envCount("SUGGESTION_CHANNEL_PAGES", CHANNEL_PAGES),
    pagesPerChannel: envCount(
      "SUGGESTION_CHANNEL_PAGES_PER_CHANNEL",
      CHANNEL_PAGES_PER_CHANNEL
    ),
    deadlineMs: started + CHANNEL_DEADLINE_MS,
    resweepAfterMs: CHANNEL_RESWEEP_MS,
    maxCutsPerSong: CUTS_PER_SONG,
  });
  if (fromChannels.seeded > 0) pending = await pendingEntries(demand);

  const cutoff = new Date(Date.now() - REFRESH_AFTER_DAYS * 24 * 60 * 60 * 1000);
  const { refreshed, dropped, skipped } = await refreshStale(
    cutoff,
    REFRESH_PER_RUN
  );

  // Last and cheapest to lose, so these give way near the run's ceiling.
  const timeLeft = () => Date.now() - started < RUN_BUDGET_MS;
  const budget = envCount("SUGGESTION_RESOLVE_PER_RUN", DEFAULT_RESOLVE_PER_RUN);
  const { searched } = useSearch && timeLeft()
    ? await resolveBySearch(pending, budget)
    : { searched: 0 };

  // An unused search is lost for good, so leftover budget widens thin entries.
  const { searched: widened } = useSearch && searched < budget && timeLeft()
    ? await resolveBySearch(
        await thinEntries(THIN_RESULTS, demand),
        budget - searched
      )
    : { searched: 0 };

  const { pinned } = await pinPopularPicks();

  const report: ResolveReport & { catalog: number; ms: number } = {
    seededFromCache: fromCache.seeded,
    seededFromAdds: fromAdds.seeded,
    rejectedAdds: fromAdds.rejected,
    seededFromChannels: fromChannels.seeded,
    channels: fromChannels.channels,
    missingChannels: fromChannels.missing,
    channelUnits: fromChannels.units,
    channelPages: fromChannels.pages,
    channelsStoppedEarly: fromChannels.stoppedEarly,
    refreshed,
    dropped,
    skipped,
    pinned,
    searched,
    widened,
    remaining: Math.max(pending.length - searched, 0),
    catalog: suggestionCatalog().size,
    ms: Date.now() - started,
  };
  console.log("Suggestion catalog run:", JSON.stringify(report));
  res.status(200).json(report);
}
