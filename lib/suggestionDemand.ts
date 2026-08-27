import { getAnalyticsDb } from "./mongodb";
import type { SearchDemandScore } from "./searchDemandRead";
import type { DemandScore } from "./songCorpus";
import { buildSearchQuery, searchCacheKey } from "./searchQuery";
import { suggestionCatalog } from "./suggestionCatalog";

/** The event records romanised names but the catalog keys on native script, so
 *  rebuilding the key from event fields matched nothing for ja/ko/in, silently. */
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
export async function suggestionDemand(): Promise<Map<string, number>> {
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

/**
 * The two halves of wanting, added. They can't double-count the resolver queue:
 * a tap needs a shelf, and a cutless song renders on none.
 *
 * `wantedIn` is ledger-only — a tap carries no country — and recordDemand
 * rewrites it nightly, so a reach the ledger stops seeing decays rather than
 * ranking a song forever on a month it once had.
 */
export function mergeDemand(
  taps: Map<string, number>,
  searches: Map<string, SearchDemandScore>
): Map<string, DemandScore> {
  const merged = new Map<string, DemandScore>();
  taps.forEach((count, key) => {
    merged.set(key, { demand: count, wantedIn: 0 });
  });
  searches.forEach((score, key) => {
    const held = merged.get(key);
    merged.set(key, {
      demand: (held ? held.demand : 0) + score.searches,
      wantedIn: score.countries,
    });
  });
  return merged;
}
