import { NextApiRequest, NextApiResponse } from "next";
import { trackEvent } from "../../../../lib/analytics";
import { recordSpend } from "../../../../lib/corpusBudget";
import { rateLimit } from "../../../../lib/limits";
import {
  clearInFlightSearch,
  getInFlightSearch,
  searchWithBurstRetry,
  setInFlightSearch,
} from "../../../../lib/liveSearch";
import { getRoomsCollection } from "../../../../lib/mongodb";
import { OriginalVideoCandidate, searchCandidateDetails } from "../../../../lib/originalVideo";
import { normalizeRoomId } from "../../../../lib/roomCode";
import { readCache, writeCache } from "../../../../lib/searchCache";
import { searchCacheKey } from "../../../../lib/searchQuery";
import { confirmDailyOut, searchQuotaSpent } from "../../../../lib/searchQuotaStatus";
import { YoutubeApiError } from "../../../../lib/youtubeApi";

type SearchStatus = "ok" | "none" | "quota" | "busy";

const MIN_QUERY = 2;
const MAX_QUERY = 120;

/** The host's own music-video search. Shares the singer search's rate bucket and
 *  daily allowance, and deliberately never feeds the corpus or singer search stats. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }
  const roomId = normalizeRoomId(req.query.id);
  const rawQ = typeof req.query.q === "string" ? req.query.q.trim().replace(/\s+/g, " ") : "";
  if (typeof roomId !== "string" || rawQ.length < MIN_QUERY || rawQ.length > MAX_QUERY) {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }
  if (!rateLimit(req, "original-video-search", 20, 60_000)) {
    res.status(429).json({ code: 429, message: "Too many requests, slow down." });
    return;
  }
  res.setHeader("Cache-Control", "private, no-store");

  const respond = async (
    status: SearchStatus,
    candidates: OriginalVideoCandidate[],
    source: "cache" | "live" | "quota" | "busy"
  ) => {
    await trackEvent(req, "original_video_searched", { roomId, source });
    res.status(200).json({ status, candidates });
  };

  try {
    const rooms = await getRoomsCollection();
    if (!(await rooms.findOne({ id: roomId }, { projection: { _id: 1 } }))) {
      res.status(404).json({ code: 404, message: "Room not found." });
      return;
    }

    // Namespaced away from search.ts ("|" keys) and the resolver ("original:").
    const key = `original-search:${searchCacheKey(rawQ)}`;
    const cached = await readCache(key);
    if (cached) {
      const candidates = searchCandidateDetails(cached.results);
      await respond(candidates.length ? "ok" : "none", candidates, "cache");
      return;
    }

    const pending = getInFlightSearch(key);
    if (pending) {
      const candidates = searchCandidateDetails(await pending);
      await respond(candidates.length ? "ok" : "none", candidates, "live");
      return;
    }

    if (await searchQuotaSpent()) {
      await respond("quota", [], "quota");
      return;
    }
    if (!rateLimit(req, "search", 10, 60_000)) {
      await respond("busy", [], "busy");
      return;
    }

    const live = searchWithBurstRetry(rawQ, "any", "relevance");
    setInFlightSearch(key, live);
    try {
      const results = await live;
      writeCache(key, results);
      await recordSpend(Date.now(), { searches: 1 }).catch(() => {});
      const candidates = searchCandidateDetails(results);
      await respond(candidates.length ? "ok" : "none", candidates, "live");
    } finally {
      clearInFlightSearch(key, live);
    }
  } catch (e) {
    const limit = e instanceof YoutubeApiError ? e.limit : null;
    if (await confirmDailyOut(limit)) {
      await respond("quota", [], "quota");
      return;
    }
    if (limit !== null) {
      await respond("busy", [], "busy");
      return;
    }
    console.error("original-video search failed:", e);
    res.status(502).json({ code: 502, message: "Search is temporarily unavailable." });
  }
}
