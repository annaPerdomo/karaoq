import { NextApiRequest, NextApiResponse } from "next";
import { readCache, writeCache, SearchResult } from "../../lib/searchCache";
import { YoutubeApiError } from "../../lib/youtubeApi";
import { searchYoutubeApi } from "../../lib/youtubeSearch";
import { catalogEntry, isCatalogFilters } from "../../lib/suggestionCatalog";
import { recordSearchResults } from "../../lib/songCorpus";
import { MAX_ENTRY_ID_LENGTH, markRateLimitNotified, rateLimit } from "../../lib/limits";
import { normalizeRoomId } from "../../lib/roomCode";
import { trackEvent } from "../../lib/analytics";
import { sendQuotaAlertOnce } from "../../lib/alerts";
import { quotaResetsAt } from "../../lib/pacificTime";
import { normalizeSearchQuery, searchCacheKey } from "../../lib/searchQuery";

const VALID_DURATIONS = new Set(["any", "short", "medium", "long"]);
const VALID_SORTS = new Set(["relevance", "viewCount", "date", "rating"]);
const MAX_QUERY_LENGTH = 200;

// A fortnight, not a day: karaoke cuts barely move month to month, and at 100
// searches/day a popular query re-spent 1% of the pool every 24h. Held under
// the 21-day retention so a stale fallback window survives (lib/searchCache).
const FRESH_CACHE_MS = 14 * 24 * 60 * 60 * 1000;

// Two singers tapping the same trending song within seconds used to burn two
// of the day's ~100 searches. Per-instance, but Fluid Compute routes concurrent
// requests into one instance — exactly the window the duplicate burn happened
// in. A race past the lookup just means two live calls, as before.
const inFlightSearches = new Map<string, Promise<SearchResult[]>>();

// searchCacheKey folds punctuation, so "abba -dancing queen karaoke" keys to the
// song it tells YouTube to leave out — and cuts are appended, never overwritten,
// so one crafted request would answer that song for every room until it expires.
const SEARCH_OPERATORS = /(^|\s)[-#]\S|["|]/;

/** Five catalog songs wear the punctuation in their names ("NARUTO -ナルト-"), so
 *  an operator only disqualifies a query the corpus wouldn't have run itself. */
function banksIntoCorpus(songKey: string, normalizedQ: string): boolean {
  if (!SEARCH_OPERATORS.test(normalizedQ)) return true;
  const entry = catalogEntry(songKey);
  return !!entry && entry.query.toLowerCase() === normalizedQ.toLowerCase();
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

  // Diagnostic only; never touches the cache key or the results.
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

  // The same rule the client applies before sending, so "abba karaoke karaoke"
  // from an older client can't key one intent twice. See lib/searchQuery.
  const normalizedQ = normalizeSearchQuery(q);

  const queryKey = searchCacheKey(normalizedQ);
  const cacheKey = `${queryKey}|${duration}|${sortBy}`;

  let cached = await readCache(cacheKey);

  // The key used to be the raw lowercased query, so folding out punctuation
  // orphaned every entry holding an apostrophe or accent. Retire this once the
  // 21-day retention has cycled the old keys out.
  if (!cached) {
    const legacyKey = `${q.trim().toLowerCase()}|${duration}|${sortBy}`;
    if (legacyKey !== cacheKey) {
      const legacy = await readCache(legacyKey);
      if (legacy) {
        cached = legacy;
        // Rewriting restarts the age clock, so a stale copy must not be
        // laundered into a fresh one.
        if (legacy.ageMs < FRESH_CACHE_MS && legacy.results.length > 0) {
          writeCache(cacheKey, legacy.results);
        }
      }
    }
  }

  if (cached && cached.ageMs < FRESH_CACHE_MS) {
    res.setHeader("x-karaoq-search-cache", "fresh");
    res.status(200).json(cached.results);
    return;
  }

  // An aging entry that found nothing is worthless as a fallback: replaying it
  // would tell someone their song doesn't exist when we simply couldn't look.
  const staleFallback =
    cached && cached.results.length > 0 ? cached.results : null;

  // Before the rate limit, which only meters live spends.
  const pending = inFlightSearches.get(cacheKey);
  if (pending) {
    try {
      const results = await pending;
      res.setHeader("x-karaoq-search-cache", "coalesced");
      res.status(200).json(results);
      return;
    } catch {
      // The leader's own error path did the tracking/alerting; fall through
      // and run the normal rate-limited, budgeted path for this request.
    }
  }

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

  const live = searchYoutubeApi(normalizedQ, duration, sortBy);
  inFlightSearches.set(cacheKey, live);
  try {
    const results = await live;
    writeCache(cacheKey, results);
    res.setHeader("x-karaoq-search-cache", "miss");
    res.status(200).json(results);
    // A search one singer paid for fills the cuts every later tap reads for free.
    // After the response but awaited, never dropped: two dependent writes, and a
    // dropped promise dies with the frozen instance (lib/songCorpus).
    if (isCatalogFilters(duration, sortBy) && banksIntoCorpus(queryKey, normalizedQ)) {
      await recordSearchResults(queryKey, results).catch(() => {});
    }
    return;
  } catch (e: any) {
    console.warn("YouTube API search failed:", e?.message);

    const quotaExceeded = e instanceof YoutubeApiError && e.quotaExceeded;
    const failReason = quotaExceeded ? "quota" : "upstream";

    // Ahead of the stale-fallback return, so a day the cache quietly covers
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
  } finally {
    // A follower whose leader failed starts a fresh search under the same key;
    // the leader's cleanup must not delete it.
    if (inFlightSearches.get(cacheKey) === live) inFlightSearches.delete(cacheKey);
  }
}
