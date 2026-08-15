import { getSearchCacheCollection } from "./mongodb";

export interface SearchResult {
  title: string;
  thumbnailUrl: string;
  videoId: string;
  durationSeconds?: number;
  viewCount?: number;
}

// Each uncached YouTube search burns 100 of the 10,000 daily quota units, so
// caching stretches it from ~100 searches/day to ~100 *distinct* searches/day.
//
// Entries stay readable for 14 days (TTL index in lib/mongodb.ts) but are only
// served outright inside the caller's freshness window. Past that they are the
// outage fallback, so a spent quota degrades to stale results, not an error.
//
// Shared by /api/search and /api/video-lookup; their keys can never collide,
// search keys always contain "|" and lookup keys are always "video:<id>".

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
