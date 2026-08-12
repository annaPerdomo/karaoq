import { NextApiRequest, NextApiResponse } from "next";
import { readCache, writeCache, SearchResult } from "../../lib/searchCache";
import { fetchYoutubeApi, YoutubeApiError } from "../../lib/youtubeApi";
import { MAX_ENTRY_ID_LENGTH, markRateLimitNotified, rateLimit } from "../../lib/limits";
import { normalizeRoomId } from "../../lib/roomCode";
import { parseIso8601Duration } from "../../lib/duration";
import { trackEvent } from "../../lib/analytics";
import { sendQuotaAlertOnce } from "../../lib/alerts";
import { quotaResetsAt } from "../../lib/pacificTime";

const VALID_DURATIONS = new Set(["any", "short", "medium", "long"]);
const VALID_SORTS = new Set(["relevance", "viewCount", "date", "rating"]);
const MAX_QUERY_LENGTH = 200;

// Search results are only served outright while under a day old; past that a
// live search refreshes them and the aging copy becomes the outage fallback
// (see lib/searchCache).
const FRESH_CACHE_MS = 24 * 60 * 60 * 1000;

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

  const data = await fetchYoutubeApi(
    "https://www.googleapis.com/youtube/v3/search?" + params,
    8000
  );

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

  // Diagnostic only — which room's singers saw a failed search. Never touches
  // the cache key or the results; "" when the client predates the field or the
  // value is implausible.
  const rawRoomId = normalizeRoomId(req.query.roomId);
  const roomId =
    typeof rawRoomId === "string" && rawRoomId.length <= MAX_ENTRY_ID_LENGTH
      ? rawRoomId
      : "";

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
    // Guarded so holding the limiter down can't fill the free tier with
    // never-expiring docs (see markRateLimitNotified). Awaited, not
    // fire-and-forget: the response freezes the function, and a failure we
    // never recorded is one we can't see on /admin.
    if (markRateLimitNotified(req, "search")) {
      await trackEvent(req, "search_failed", {
        roomId,
        failReason: "rate_limited",
        searchOutcome: "error",
      });
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

    const quotaExceeded = e instanceof YoutubeApiError && e.quotaExceeded;
    const failReason = quotaExceeded ? "quota" : "upstream";

    // Ahead of the stale-fallback return, so the day the cache quietly covers
    // for a spent quota still pages someone. Never throws.
    if (quotaExceeded) await sendQuotaAlertOnce(req);

    // Serving a stale copy beats telling someone their song doesn't exist
    // because we're out of quota.
    if (staleFallback) {
      await trackEvent(req, "search_failed", {
        roomId,
        failReason,
        searchOutcome: "stale",
      });
      res.setHeader("x-karaoq-search-cache", "stale");
      res.status(200).json(staleFallback);
      return;
    }

    await trackEvent(req, "search_failed", {
      roomId,
      failReason,
      searchOutcome: "error",
    });

    if (quotaExceeded) {
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
