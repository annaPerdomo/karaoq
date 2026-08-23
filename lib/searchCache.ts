import { getSearchCacheCollection } from "./mongodb";

export interface SearchResult {
  title: string;
  thumbnailUrl: string;
  videoId: string;
  durationSeconds?: number;
  viewCount?: number;
}

// The binding limit is the separate "Search Queries per day" quota: 100
// search.list *calls* per day, project-wide. Entries stay readable for 21 days but
// are served outright only inside the caller's freshness window; past that they
// are the outage fallback.

export interface CacheHit {
  results: SearchResult[];
  ageMs: number;
}

export async function readCache(cacheKey: string): Promise<CacheHit | null> {
  try {
    const cache = await getSearchCacheCollection();
    const hit = await cache.findOne({ key: cacheKey });
    if (!hit) return null;
    // No usable createdAt reads as infinitely old: a fallback, never fresh.
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

/** A result set is served fresh for a fortnight, so a video the sweep found gone
 *  has to leave those rows with it or a room queues something that can't play. */
export async function pruneCachedVideos(videoIds: string[]): Promise<number> {
  if (videoIds.length === 0) return 0;
  try {
    const cache = await getSearchCacheCollection();
    const pruned = await cache.updateMany(
      { "results.videoId": { $in: videoIds } },
      { $pull: { results: { videoId: { $in: videoIds } } } }
    );
    // An entry pruned to nothing is served as a fresh "not on YouTube"; deleting
    // it costs one search to redo.
    await cache.deleteMany({ results: { $size: 0 } });
    return pruned.modifiedCount;
  } catch {
    return 0;
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
