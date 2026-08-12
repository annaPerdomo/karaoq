import { getSearchCacheCollection } from "./mongodb";

export interface SearchResult {
  title: string;
  thumbnailUrl: string;
  videoId: string;
  durationSeconds?: number;
  viewCount?: number;
}

// Song searches repeat heavily across rooms ("bohemian rhapsody karaoke"),
// and each uncached YouTube API search burns 100 of the 10,000 daily quota
// units. Cached results are served from Mongo, which stretches the quota from
// ~100 searches/day to ~100 *distinct* searches/day.
//
// Entries stay readable for 14 days (TTL index in lib/mongodb.ts) but are only
// served outright while under the caller's freshness window. Past that a live
// call runs first and refreshes them; the aging copy is used only when YouTube
// is unreachable or out of quota, so a spent quota degrades to slightly-stale
// results instead of an error page.
//
// Shared by /api/search and /api/video-lookup. Their keys can never collide:
// search keys always contain "|", lookup keys are always "video:<id>".

export interface CacheHit {
  results: SearchResult[];
  ageMs: number;
}

export async function readCache(cacheKey: string): Promise<CacheHit | null> {
  try {
    const cache = await getSearchCacheCollection();
    const hit = await cache.findOne({ key: cacheKey });
    if (!hit) return null;
    // A doc with no usable createdAt reads as infinitely old, so it's kept as
    // a fallback but never served as fresh.
    const writtenAt =
      hit.createdAt instanceof Date ? hit.createdAt.getTime() : 0;
    return {
      results: hit.results as SearchResult[],
      ageMs: Date.now() - writtenAt,
    };
  } catch {
    return null; // cache is best-effort; fall through to a live search
  }
}

export function writeCache(cacheKey: string, results: SearchResult[]): void {
  getSearchCacheCollection()
    .then((cache) =>
      cache.updateOne(
        { key: cacheKey },
        { $set: { key: cacheKey, results, createdAt: new Date() } },
        { upsert: true }
      )
    )
    .catch(() => {});
}
