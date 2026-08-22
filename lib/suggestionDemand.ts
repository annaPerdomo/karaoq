import { getAnalyticsDb } from "./mongodb";
import { buildSearchQuery, searchCacheKey } from "./searchQuery";
import { suggestionCatalog } from "./suggestionCatalog";

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
