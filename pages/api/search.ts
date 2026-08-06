import { NextApiRequest, NextApiResponse } from "next";
import { getSearchCacheCollection } from "../../lib/mongodb";
import { rateLimit } from "../../lib/limits";
import { parseIso8601Duration } from "../../lib/duration";

const VALID_DURATIONS = new Set(["any", "short", "medium", "long"]);
const VALID_SORTS = new Set(["relevance", "viewCount", "date", "rating"]);
const MAX_QUERY_LENGTH = 200;

interface SearchResult {
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
// served outright while under FRESH_CACHE_MS old. Past that a live search runs
// first and refreshes them; the aging copy is used only when YouTube is
// unreachable or out of quota, so a spent quota degrades to slightly-stale
// results instead of an error page.
const FRESH_CACHE_MS = 24 * 60 * 60 * 1000;

interface CacheHit {
  results: SearchResult[];
  ageMs: number;
}

async function readCache(cacheKey: string): Promise<CacheHit | null> {
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

function writeCache(cacheKey: string, results: SearchResult[]): void {
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

/** A YouTube API failure, flagged when the cause is a spent quota so callers
 * can say when search comes back rather than "try again shortly". */
class YoutubeApiError extends Error {
  quotaExceeded: boolean;
  constructor(message: string, quotaExceeded: boolean) {
    super(message);
    this.name = "YoutubeApiError";
    this.quotaExceeded = quotaExceeded;
  }
}

// The daily quota resets at midnight Pacific, which is what YouTube bills
// against regardless of where the singer is.
function quotaResetsAt(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(now);
  const part = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const secondsIntoDay =
    (part("hour") % 24) * 3600 + part("minute") * 60 + part("second");
  return new Date(now.getTime() + (86400 - secondsIntoDay) * 1000).toISOString();
}

async function searchWithYoutubeApi(
  q: string,
  duration: string,
  sortBy: string
): Promise<SearchResult[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("No YouTube API key configured");

  // A search.list call costs the same 100 quota units whether it returns 8
  // results or 50 — so ask for 25 and let the client page through them for
  // free instead of burning another call.
  const params = new URLSearchParams({
    part: "snippet",
    q,
    videoEmbeddable: "true",
    key,
    type: "video",
    maxResults: "25",
    order: sortBy,
  });
  if (duration !== "any") params.set("videoDuration", duration);

  const resp = await fetch(
    "https://www.googleapis.com/youtube/v3/search?" + params,
    { signal: AbortSignal.timeout(8000) }
  );
  // Parse the body even on a non-2xx: the reason code is the only way to tell
  // "out of quota for today" apart from a key/config problem, and YouTube
  // reports an exhausted quota as either 403 quotaExceeded or 429
  // rateLimitExceeded / RESOURCE_EXHAUSTED depending which limit tripped.
  const data = await resp.json().catch(() => null);
  const apiError = data?.error;
  if (!resp.ok || apiError) {
    const reason = apiError?.errors?.[0]?.reason ?? "";
    const exhausted =
      reason === "quotaExceeded" ||
      reason === "rateLimitExceeded" ||
      apiError?.status === "RESOURCE_EXHAUSTED" ||
      resp.status === 429;
    throw new YoutubeApiError(
      apiError?.message || `YouTube API ${resp.status}`,
      exhausted
    );
  }

  const results: SearchResult[] =
    data?.items
      ?.filter((item: any) => item.id?.videoId)
      .map((item: any) => ({
        title: item.snippet.title ?? "",
        thumbnailUrl:
          item.snippet.thumbnails.medium?.url ||
          item.snippet.thumbnails.default?.url,
        videoId: item.id.videoId,
      })) ?? [];

  return enrichWithVideoDetails(results, key);
}

// videos.list is a flat 1 quota unit for up to 50 ids (vs 100 for the search
// itself), so duration/view-count badges cost ~1% extra quota. Best-effort:
// any failure just returns the bare results.
async function enrichWithVideoDetails(
  results: SearchResult[],
  key: string
): Promise<SearchResult[]> {
  if (results.length === 0) return results;
  try {
    const params = new URLSearchParams({
      part: "contentDetails,statistics",
      id: results.map((r) => r.videoId).join(","),
      key,
    });
    const resp = await fetch(
      "https://www.googleapis.com/youtube/v3/videos?" + params,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!resp.ok) return results;

    const data = await resp.json();
    const byId = new Map<string, any>(
      (data.items ?? []).map((item: any) => [item.id, item])
    );
    return results.map((r) => {
      const item = byId.get(r.videoId);
      if (!item) return r;
      const durationSeconds = parseIso8601Duration(
        item.contentDetails?.duration ?? ""
      );
      const viewCount = Number(item.statistics?.viewCount);
      return {
        ...r,
        ...(durationSeconds !== undefined ? { durationSeconds } : {}),
        ...(Number.isFinite(viewCount) ? { viewCount } : {}),
      };
    });
  } catch {
    return results;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  const q = req.query.q;
  if (typeof q !== "string" || !q.trim() || q.length > MAX_QUERY_LENGTH) {
    res.status(400).json({ code: 400, message: "Missing query." });
    return;
  }

  const duration =
    typeof req.query.duration === "string" && VALID_DURATIONS.has(req.query.duration)
      ? req.query.duration
      : "any";
  const sortBy =
    typeof req.query.sortBy === "string" && VALID_SORTS.has(req.query.sortBy)
      ? req.query.sortBy
      : "relevance";

  const cacheKey = `${q.trim().toLowerCase()}|${duration}|${sortBy}`;

  const cached = await readCache(cacheKey);
  if (cached && cached.ageMs < FRESH_CACHE_MS) {
    res.setHeader("x-karaoq-search-cache", "fresh");
    res.status(200).json(cached.results);
    return;
  }

  // An aging entry that found nothing is worthless as a fallback: replaying it
  // would tell someone their song doesn't exist when we simply couldn't look.
  const staleFallback =
    cached && cached.results.length > 0 ? cached.results : null;

  // Only searches that would go live hit the rate limit: cache hits are cheap,
  // but each miss burns one of the day's YouTube searches.
  if (!rateLimit(req, "search", 10, 60_000)) {
    if (staleFallback) {
      res.setHeader("x-karaoq-search-cache", "stale");
      res.status(200).json(staleFallback);
      return;
    }
    res.status(429).json({ code: 429, message: "Too many searches, slow down." });
    return;
  }

  try {
    const results = await searchWithYoutubeApi(q, duration, sortBy);
    writeCache(cacheKey, results);
    res.setHeader("x-karaoq-search-cache", "miss");
    res.status(200).json(results);
    return;
  } catch (e: any) {
    console.warn("YouTube API search failed:", e?.message);

    // Serving a stale copy beats telling someone their song doesn't exist
    // because we're out of quota.
    if (staleFallback) {
      res.setHeader("x-karaoq-search-cache", "stale");
      res.status(200).json(staleFallback);
      return;
    }

    if (e instanceof YoutubeApiError && e.quotaExceeded) {
      res.status(503).json({
        code: 503,
        reason: "quota",
        resetsAt: quotaResetsAt(),
        message: "Daily search limit reached.",
      });
      return;
    }

    res.status(502).json({ code: 502, message: "Search is temporarily unavailable." });
  }
}
