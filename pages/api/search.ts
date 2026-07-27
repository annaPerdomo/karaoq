import { NextApiRequest, NextApiResponse } from "next";
import { getSearchCacheCollection } from "../../lib/mongodb";
import { rateLimit } from "../../lib/limits";
import { parseIso8601Duration } from "../../lib/duration";

const INVIDIOUS_INSTANCES = [
  "https://invidious.materialio.us",
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
];

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
// units. Cached results are served from Mongo for 24h (TTL index in
// lib/mongodb.ts), which stretches the quota from ~100 searches/day to
// ~100 *distinct* searches/day.
async function readCache(cacheKey: string): Promise<SearchResult[] | null> {
  try {
    const cache = await getSearchCacheCollection();
    const hit = await cache.findOne({ key: cacheKey });
    return hit ? hit.results : null;
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
  if (!resp.ok) throw new Error(`YouTube API ${resp.status}`);

  const data = await resp.json();
  if (data.error) throw new Error(data.error.message || "YouTube API error");

  const results: SearchResult[] =
    data.items
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

async function searchWithInvidious(q: string): Promise<SearchResult[] | null> {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const params = new URLSearchParams({ q, type: "video" });
      const resp = await fetch(`${instance}/api/v1/search?${params}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) continue;

      const data = await resp.json();
      if (!Array.isArray(data) || data.length === 0) continue;

      const candidates = data
        .filter((item: any) => item.type === "video" && item.videoId)
        .slice(0, 24)
        .map((item: any) => ({
          title: item.title ?? "",
          thumbnailUrl: `https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`,
          videoId: item.videoId,
          // Invidious ships these in the search response itself — no extra calls.
          ...(Number.isFinite(item.lengthSeconds) && item.lengthSeconds > 0
            ? { durationSeconds: item.lengthSeconds }
            : {}),
          ...(Number.isFinite(item.viewCount) && item.viewCount > 0
            ? { viewCount: item.viewCount }
            : {}),
        }));

      // Check embeddability via YouTube oEmbed (401 = not embeddable)
      const checks = await Promise.all(
        candidates.map(async (r: any) => {
          try {
            const oembedResp = await fetch(
              `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${r.videoId}&format=json`,
              { method: "HEAD", signal: AbortSignal.timeout(3000) }
            );
            return oembedResp.ok ? r : null;
          } catch {
            return null;
          }
        })
      );

      const embeddable = checks.filter(Boolean).slice(0, 24);
      // All candidates failing the oEmbed check is this instance (or the
      // check) having a bad minute, not a real "no results" — move on rather
      // than handing back an empty list that would get cached for 24h.
      if (embeddable.length === 0) continue;
      return embeddable;
    } catch {
      // Try next instance
    }
  }
  return null;
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
  if (cached) {
    res.status(200).json(cached);
    return;
  }

  // Only uncached searches hit the rate limit: cache reads are cheap, but
  // each miss burns 100 YouTube quota units.
  if (!rateLimit(req, "search", 10, 60_000)) {
    res.status(429).json({ code: 429, message: "Too many searches, slow down." });
    return;
  }

  try {
    const results = await searchWithYoutubeApi(q, duration, sortBy);
    writeCache(cacheKey, results);
    res.status(200).json(results);
    return;
  } catch (e: any) {
    console.warn("YouTube API search failed, trying Invidious:", e?.message);
  }

  // Invidious ignores duration/sort filters, but degraded results beat none.
  const fallback = await searchWithInvidious(q);
  if (fallback) {
    // Never cache an empty fallback: a degraded backend must not blank this
    // query for a full cache TTL.
    if (fallback.length > 0) writeCache(cacheKey, fallback);
    res.status(200).json(fallback);
    return;
  }

  res.status(502).json({ code: 502, message: "All search backends unavailable." });
}
