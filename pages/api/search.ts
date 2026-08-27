import { NextApiRequest, NextApiResponse } from "next";
import { recordSpend } from "../../lib/corpusBudget";
import { readCache, writeCache, SearchResult } from "../../lib/searchCache";
import { YoutubeApiError } from "../../lib/youtubeApi";
import { searchYoutubeApi } from "../../lib/youtubeSearch";
import { catalogEntry, isCatalogFilters } from "../../lib/suggestionCatalog";
import { bankSearchEvidence, recordSearchResults } from "../../lib/songCorpus";
import { readSongCuts } from "../../lib/corpusRead";
import { MAX_ENTRY_ID_LENGTH, markRateLimitNotified, rateLimit } from "../../lib/limits";
import { normalizeRoomId } from "../../lib/roomCode";
import { extractGeo, trackEvent } from "../../lib/analytics";
import { sendQuotaAlertOnce } from "../../lib/alerts";
import { quotaResetsAt } from "../../lib/pacificTime";
import {
  hasSearchOperators,
  normalizeSearchQuery,
  searchCacheKey,
} from "../../lib/searchQuery";

const VALID_DURATIONS = new Set(["any", "short", "medium", "long"]);
const VALID_SORTS = new Set(["relevance", "viewCount", "date", "rating"]);
const MAX_QUERY_LENGTH = 200;

// A fortnight, not a day: at 100 searches/day a popular query re-spent 1% of the
// pool every 24h. Held under the 21-day retention so a fallback window survives.
const FRESH_CACHE_MS = 14 * 24 * 60 * 60 * 1000;

// Per-instance, but Fluid Compute routes concurrent requests into one instance —
// exactly the window in which two singers tapping one song burned two searches.
const inFlightSearches = new Map<string, Promise<SearchResult[]>>();

// YouTube bills no quota for the call it refused, so a burst retry costs the
// wait and nothing else. A spent day is never retried: it cannot clear before
// the Pacific reset.
const BURST_RETRY_MS = 700;

async function searchWithBurstRetry(
  q: string,
  duration: string,
  sortBy: string
): Promise<SearchResult[]> {
  try {
    return await searchYoutubeApi(q, duration, sortBy);
  } catch (e: any) {
    if (!(e instanceof YoutubeApiError) || e.limit !== "burst") throw e;
    await new Promise((resolve) => setTimeout(resolve, BURST_RETRY_MS));
    return searchYoutubeApi(q, duration, sortBy);
  }
}

/** Cuts are appended, never overwritten, so a crafted operator query would answer
 *  its folded song for every room. Five catalog songs wear the punctuation
 *  themselves ("NARUTO -ナルト-"), hence the exact-query escape. */
function banksIntoCorpus(songKey: string, normalizedQ: string): boolean {
  if (!hasSearchOperators(normalizedQ)) return true;
  const entry = catalogEntry(songKey);
  return !!entry && entry.query.toLowerCase() === normalizedQ.toLowerCase();
}

/** An operator query asked YouTube something else entirely, so it keys on its own
 *  unfolded text, which no folded key can equal. */
function cacheEntryKey(queryKey: string, normalizedQ: string): string {
  return hasSearchOperators(normalizedQ) ? normalizedQ.toLowerCase() : queryKey;
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

  // The same rule the client applies, so an older client's "abba karaoke karaoke"
  // can't key one intent twice.
  const normalizedQ = normalizeSearchQuery(q);

  const queryKey = searchCacheKey(normalizedQ);
  const cacheKey = `${cacheEntryKey(queryKey, normalizedQ)}|${duration}|${sortBy}`;

  const country = extractGeo(req).country;

  let cached = await readCache(cacheKey);

  // Entries written before the fold are keyed on the raw lowercased query.
  // Retire once the 21-day retention has cycled those keys out.
  if (!cached) {
    const legacyKey = `${q.trim().toLowerCase()}|${duration}|${sortBy}`;
    if (legacyKey !== cacheKey) {
      const legacy = await readCache(legacyKey);
      if (legacy) {
        cached = legacy;
        // Rewriting restarts the age clock: don't launder a stale copy fresh.
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
      // The leader's own error path did the tracking; fall through and run the
      // normal rate-limited path for this request.
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

  const live = searchWithBurstRetry(normalizedQ, duration, sortBy);
  inFlightSearches.set(cacheKey, live);
  try {
    const results = await live;
    writeCache(cacheKey, results);
    res.setHeader("x-karaoq-search-cache", "miss");
    res.status(200).json(results);
    // Billed only on success, and to the same ledger the cron draws from, so
    // "what did today actually cost" is one number rather than two half-views.
    // It is what lets the nightly run see how much of the day rooms have
    // already spent (lib/corpusBudget, pages/api/cron/suggestions).
    await recordSpend(Date.now(), { searches: 1 }).catch(() => {});
    // Awaited after the response, never dropped: a dropped promise dies with the
    // frozen instance partway through two dependent writes (lib/songCorpus).
    if (isCatalogFilters(duration, sortBy) && banksIntoCorpus(queryKey, normalizedQ)) {
      const written = await recordSearchResults(queryKey, results).catch(() => null);
      if (written && !written.songKnown) {
        await bankSearchEvidence(results, { roomId, country });
      }
    }
    return;
  } catch (e: any) {
    console.warn("YouTube API search failed:", e?.message);

    const limit = e instanceof YoutubeApiError ? e.limit : null;
    // A burst ceiling clears in seconds, so it must never latch the day's
    // marker (lib/alerts) that every room poll reads: one room's busy minute
    // would otherwise tell the whole platform search is gone until midnight.
    const dailyOut = limit === "daily";
    const failReason = dailyOut
      ? "quota"
      : limit === "burst"
        ? "youtube_busy"
        : "upstream";
    const failDetail = e instanceof YoutubeApiError ? e.detail : undefined;

    // Ahead of the stale-fallback return, so a day the cache quietly covers
    // for a spent quota still pages someone. Never throws.
    if (dailyOut) await sendQuotaAlertOnce(req);

    // Serving a stale copy beats telling someone their song doesn't exist
    // because we're out of quota.
    if (staleFallback) {
      await trackEvent(req, "search_failed", {
        roomId,
        failReason,
        failDetail,
        searchOutcome: "stale",
      });
      res.setHeader("x-karaoq-search-cache", "stale");
      res.status(200).json(staleFallback);
      return;
    }

    // The nightly resolver may already have bought this song's cuts out of a
    // quota that is gone by the time a singer types its name.
    if (isCatalogFilters(duration, sortBy)) {
      const cuts = await readSongCuts(queryKey);
      if (cuts) {
        await trackEvent(req, "search_failed", {
          roomId,
          failReason,
          failDetail,
          searchOutcome: "corpus",
        });
        res.setHeader("x-karaoq-search-cache", "corpus");
        res.status(200).json(cuts);
        return;
      }
    }

    await trackEvent(req, "search_failed", {
      roomId,
      failReason,
      failDetail,
      searchOutcome: "error",
    });
    if (dailyOut) {
      res.status(503).json({
        code: 503,
        reason: "quota",
        resetsAt: quotaResetsAt(),
        message: "Daily search limit reached.",
      });
      return;
    }

    // Deliberately not `reason: "quota"`: the singer is told search is busy and
    // given a wait measured in seconds, not a countdown to midnight.
    if (limit === "burst") {
      res.setHeader("Retry-After", "30");
      res.status(503).json({
        code: 503,
        reason: "busy",
        message: "Search is busy right now, try again in a moment.",
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
