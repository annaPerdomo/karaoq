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
import { originalVideoQuery, pickOriginalCandidates } from "../../../../lib/originalVideo";
import { lookupCorpusSong } from "../../../../lib/originalVideoLookup";
import { normalizeRoomId } from "../../../../lib/roomCode";
import { readCache, writeCache } from "../../../../lib/searchCache";
import { searchCacheKey } from "../../../../lib/searchQuery";
import { confirmDailyOut, searchQuotaSpent } from "../../../../lib/searchQuotaStatus";
import { YoutubeApiError } from "../../../../lib/youtubeApi";

type OriginalVideoStatus = "ok" | "none" | "quota" | "busy";
type OriginalVideoSource = "cache" | "live" | "quota" | "busy" | "none";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  const rawRoomId = normalizeRoomId(req.query.id);
  const entryId = req.query.entryId;
  if (typeof rawRoomId !== "string" || typeof entryId !== "string" || !entryId) {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }
  const roomId: string = rawRoomId;

  if (!rateLimit(req, "original-video", 30, 60_000)) {
    res.status(429).json({ code: 429, message: "Too many requests, slow down." });
    return;
  }

  res.setHeader("Cache-Control", "private, no-store");

  async function respond(
    status: OriginalVideoStatus,
    videoIds: string[],
    source: OriginalVideoSource
  ) {
    await trackEvent(req, "original_video_resolved", { roomId, source });
    res.status(200).json({ status, videoIds });
  }

  try {
    const rooms = await getRoomsCollection();
    const room = await rooms.findOne(
      { id: roomId },
      { projection: { queue: 1, activeVideoIndex: 1 } }
    );
    if (!room) {
      res.status(404).json({ code: 404, message: "Room not found." });
      return;
    }

    const index = room.queue.findIndex((e) => e.id === entryId);
    if (index === -1) {
      res.status(404).json({ code: 404, message: "Entry not found." });
      return;
    }
    // The music-video screen only ever needs what's on stage or up next; a cue
    // for any other entry would spend a search nobody is about to hear.
    if (index !== room.activeVideoIndex && index !== room.activeVideoIndex + 1) {
      res.status(404).json({ code: 404, message: "Entry not eligible." });
      return;
    }
    const entry = room.queue[index];

    const corpus = await lookupCorpusSong(entry.videoId);
    const q = originalVideoQuery(entry.songTitle, corpus);
    if (q === null) {
      await respond("none", [], "none");
      return;
    }

    // Namespaced against search.ts's keys, which always contain "|".
    const key = `original:${searchCacheKey(q)}`;
    const cached = await readCache(key);
    if (cached) {
      const videoIds = pickOriginalCandidates(cached.results);
      await respond(videoIds.length ? "ok" : "none", videoIds, "cache");
      return;
    }

    const pending = getInFlightSearch(key);
    if (pending) {
      const results = await pending;
      const videoIds = pickOriginalCandidates(results);
      await respond(videoIds.length ? "ok" : "none", videoIds, "live");
      return;
    }

    if (await searchQuotaSpent()) {
      await respond("quota", [], "quota");
      return;
    }

    // Shares search.ts's own bucket: a music-video screen and a singer's search
    // draw against the same day's YouTube allowance.
    if (!rateLimit(req, "search", 10, 60_000)) {
      await respond("busy", [], "busy");
      return;
    }

    const live = searchWithBurstRetry(q, "any", "relevance");
    setInFlightSearch(key, live);
    try {
      const results = await live;
      writeCache(key, results);
      await recordSpend(Date.now(), { searches: 1 }).catch(() => {});
      const videoIds = pickOriginalCandidates(results);
      await respond(videoIds.length ? "ok" : "none", videoIds, "live");
    } finally {
      clearInFlightSearch(key, live);
    }
  } catch (e) {
    const limit = e instanceof YoutubeApiError ? e.limit : null;
    const dailyOut = await confirmDailyOut(limit);
    if (dailyOut) {
      await respond("quota", [], "quota");
      return;
    }
    if (limit !== null) {
      await respond("busy", [], "busy");
      return;
    }
    console.error("original-video resolve failed:", e);
    res.status(502).json({ code: 502, message: "Search is temporarily unavailable." });
  }
}
