// Server-only half of the landing page's social proof. Split from
// lib/publicStats.ts so the pure shaping helpers stay importable (and testable)
// without dragging in the Mongo driver.
//
// This runs at ISR revalidation time, never in a visitor's request path: the
// landing page is statically generated and Next serves the previous HTML while
// a stale page regenerates. So the aggregation below can be as slow as it likes
// without anyone waiting on it — which is the whole point of not fetching these
// figures from the browser.

import { getAnalyticsDb } from './mongodb';
import { shapeStats, EMPTY_STATS, type PublicStats } from './publicStats';

// Second line of defence behind ISR: several locales regenerate around the same
// time, and there's no reason for each to re-run the aggregation.
const CACHE_MS = 30 * 60 * 1000;
let cached: { stats: PublicStats; at: number } | null = null;

/**
 * Public, deliberately coarse counts for the landing page. Everything here is
 * already demo/localhost-filtered at write time (see lib/analytics.ts), so
 * plain counts are honest. Never throws — a failure just hides the strip.
 */
export async function fetchPublicStats(): Promise<PublicStats> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.stats;
  try {
    const db = await getAnalyticsDb();
    const events = db.collection('analytics_events');
    const [songs, cheers, countryDocs] = await Promise.all([
      events.countDocuments({ type: 'song_added' }),
      events.countDocuments({ type: 'reaction_sent' }),
      // Every event type counts toward the country ranking, so it reflects
      // where people actually spend time, not just one action. The `country`
      // index (see lib/mongodb.ts) turns this from a collection scan into an
      // index scan; no explicit hint, because index creation is best-effort and
      // hinting a not-yet-built index is a hard error.
      events
        .aggregate<{ _id: string }>([
          { $match: { country: { $nin: [null, ''] } } },
          { $group: { _id: '$country', n: { $sum: 1 } } },
          { $sort: { n: -1 } },
        ])
        .toArray(),
    ]);
    const stats = shapeStats({
      songs,
      cheers,
      countryCodes: countryDocs.map((d) => d._id),
    });
    cached = { stats, at: Date.now() };
    return stats;
  } catch (e) {
    console.error('Public stats error:', e);
    // A build or revalidation without a reachable database still has to produce
    // a page — the proof section simply doesn't render.
    return EMPTY_STATS;
  }
}
