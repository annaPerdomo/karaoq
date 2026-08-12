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

// Resolves one pasted YouTube link (or bare video id) to one addable result.
// A videos.list call is 1 quota unit against the same 10,000-unit daily pool a
// text search spends 101 on, which is the entire reason this endpoint exists —
// it must never fall back to search.list.

// What a video *is* barely drifts (title, duration, thumbnail), so a week-old
// copy is as good as a live one. The 14-day TTL on the collection still bounds
// every doc well inside YouTube's 30-day data-retention policy.
const FRESH_CACHE_MS = 7 * 24 * 60 * 60 * 1000;

// Diagnostic only, like roomId: which surface asked. "trending" is for the
// quota-diet work that reuses this endpoint — telling the two apart is the
// whole point of the field.
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
    // response we don't understand, and refusing a real video over it would be
    // worse than letting the player report the problem.
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

  // Diagnostic only — which room's singer pasted the link. Never touches the
  // cache key or the results; "" when the value is implausible.
  const rawRoomId = normalizeRoomId(req.query.roomId);
  const roomId =
    typeof rawRoomId === "string" && rawRoomId.length <= MAX_ENTRY_ID_LENGTH
      ? rawRoomId
      : "";

  const src = lookupSource(req.query.src);

  // Namespaced so it can never collide with a search key (those always
  // contain "|").
  const cacheKey = `video:${id}`;

  // An empty cached array means nothing usable — a lookup either resolved one
  // video or wasn't cached at all, so it can't be a legitimate "no results".
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

  // Only lookups that would go live hit the limiter. A more generous bucket
  // than search's: each of these is 1 quota unit, not 101.
  if (!rateLimit(req, "video-lookup", 20, 60_000)) {
    if (staleFallback) {
      res.setHeader("x-karaoq-search-cache", "stale");
      res.status(200).json(staleFallback);
      return;
    }
    // Guarded so holding the limiter down can't fill the free tier with
    // never-expiring docs (see markRateLimitNotified). Awaited, not
    // fire-and-forget: the response freezes the function, and a failure we
    // never recorded is one we can't see on /admin.
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

    // not_found and not_embeddable are outcomes of what the user pasted, not
    // infrastructure failures, so they stay out of search_failed (which drives
    // /admin's search-health card) and are never cached — a video made public
    // later must resolve on the next paste.
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
