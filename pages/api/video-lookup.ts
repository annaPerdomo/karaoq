import { NextApiRequest, NextApiResponse } from "next";
import { readCache, writeCache, SearchResult } from "../../lib/searchCache";
import { fetchYoutubeApi, YoutubeApiError } from "../../lib/youtubeApi";
import { MAX_ENTRY_ID_LENGTH, markRateLimitNotified, rateLimit } from "../../lib/limits";
import { VIDEO_ID_RE } from "../../lib/videoLink";
import { normalizeRoomId } from "../../lib/roomCode";
import { parseIso8601Duration } from "../../lib/duration";
import { trackEvent } from "../../lib/analytics";
import { sendQuotaAlertOnce } from "../../lib/alerts";
import { quotaResetsAt } from "../../lib/pacificTime";

// A videos.list call is 1 quota unit against the same daily pool a text search
// spends 101 on — so this endpoint must never fall back to search.list.

// What a video *is* barely drifts, so a week-old copy is as good as a live one.
// The collection's 14-day TTL keeps every doc inside YouTube's 30-day retention.
const FRESH_CACHE_MS = 7 * 24 * 60 * 60 * 1000;

// Diagnostic only. "trending" is for the quota-diet work reusing this endpoint.
type LookupSource = "paste" | "trending" | "unknown";

function lookupSource(value: unknown): LookupSource {
  return value === "paste" || value === "trending" ? value : "unknown";
}

interface LookedUpVideo {
  result: SearchResult;
  embeddable: boolean;
}

async function lookupWithYoutubeApi(id: string): Promise<LookedUpVideo | null> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("No YouTube API key configured");

  const params = new URLSearchParams({
    part: "snippet,contentDetails,statistics,status",
    id,
    key,
  });
  const data = await fetchYoutubeApi(
    "https://www.googleapis.com/youtube/v3/videos?" + params,
    5000
  );

  // An id that doesn't exist (or is private) comes back as an empty item list,
  // not an error.
  const item = data?.items?.[0];
  if (!item) return null;

  const durationSeconds = parseIso8601Duration(
    item.contentDetails?.duration ?? ""
  );
  const viewCount = Number(item.statistics?.viewCount);
  return {
    // Only an explicit false blocks the add: a missing status block is a
    // response we don't understand, and the player can report it itself.
    embeddable: item.status?.embeddable !== false,
    result: {
      title: item.snippet?.title ?? "",
      thumbnailUrl:
        item.snippet?.thumbnails?.medium?.url ||
        item.snippet?.thumbnails?.default?.url ||
        "",
      videoId: typeof item.id === "string" ? item.id : id,
      ...(durationSeconds !== undefined ? { durationSeconds } : {}),
      ...(Number.isFinite(viewCount) ? { viewCount } : {}),
    },
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  const id = req.query.id;
  if (typeof id !== "string" || !VIDEO_ID_RE.test(id)) {
    res.status(400).json({ code: 400, message: "Missing or invalid video id." });
    return;
  }

  // Diagnostic only — never part of the cache key. "" when implausible.
  const rawRoomId = normalizeRoomId(req.query.roomId);
  const roomId =
    typeof rawRoomId === "string" && rawRoomId.length <= MAX_ENTRY_ID_LENGTH
      ? rawRoomId
      : "";

  const src = lookupSource(req.query.src);

  // Namespaced against search keys, which always contain "|".
  const cacheKey = `video:${id}`;

  // A lookup either resolved one video or wasn't cached at all, so an empty
  // cached array is nothing usable rather than a legitimate "no results".
  const cached = await readCache(cacheKey);
  const usable = cached && cached.results.length > 0 ? cached : null;

  if (usable && usable.ageMs < FRESH_CACHE_MS) {
    res.setHeader("x-karaoq-search-cache", "fresh");
    await trackEvent(req, "link_lookup", {
      roomId,
      src,
      lookupOutcome: "hit",
      lookupCache: "fresh",
    });
    res.status(200).json(usable.results);
    return;
  }

  const staleFallback = usable ? usable.results : null;

  // Only lookups that would go live. Bigger bucket than search's: 1 unit, not 101.
  if (!rateLimit(req, "video-lookup", 20, 60_000)) {
    if (staleFallback) {
      res.setHeader("x-karaoq-search-cache", "stale");
      res.status(200).json(staleFallback);
      return;
    }
    // Guarded so holding the limiter down can't fill the free tier with
    // never-expiring docs. Awaited: the response below freezes the function.
    if (markRateLimitNotified(req, "video-lookup")) {
      await trackEvent(req, "search_failed", {
        roomId,
        failReason: "rate_limited",
        searchOutcome: "error",
      });
    }
    res.status(429).json({ code: 429, message: "Too many lookups, slow down." });
    return;
  }

  try {
    const video = await lookupWithYoutubeApi(id);

    // Outcomes of what the user pasted, not infrastructure failures: they stay
    // out of search_failed (/admin's health card) and are never cached — a
    // video made public later must resolve on the next paste.
    if (!video) {
      await trackEvent(req, "link_lookup", {
        roomId,
        src,
        lookupOutcome: "not_found",
        lookupCache: "miss",
      });
      res.status(404).json({
        code: 404,
        reason: "not_found",
        message: "No such video.",
      });
      return;
    }

    if (!video.embeddable) {
      await trackEvent(req, "link_lookup", {
        roomId,
        src,
        lookupOutcome: "not_embeddable",
        lookupCache: "miss",
      });
      res.status(422).json({
        code: 422,
        reason: "not_embeddable",
        message: "That video can't be played outside YouTube.",
      });
      return;
    }

    writeCache(cacheKey, [video.result]);
    res.setHeader("x-karaoq-search-cache", "miss");
    await trackEvent(req, "link_lookup", {
      roomId,
      src,
      lookupOutcome: "hit",
      lookupCache: "miss",
    });
    res.status(200).json([video.result]);
    return;
  } catch (e: any) {
    console.warn("YouTube API lookup failed:", e?.message);

    const quotaExceeded = e instanceof YoutubeApiError && e.quotaExceeded;
    const failReason = quotaExceeded ? "quota" : "upstream";

    // Ahead of the stale-fallback return, so the day the cache quietly covers
    // for a spent quota still pages someone. Never throws.
    if (quotaExceeded) await sendQuotaAlertOnce(req);

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

    res
      .status(502)
      .json({ code: 502, message: "Lookup is temporarily unavailable." });
  }
}
