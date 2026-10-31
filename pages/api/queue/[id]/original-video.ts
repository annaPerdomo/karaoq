import { NextApiRequest, NextApiResponse } from "next";
import { SCREEN_EVENT_TTL_MS, trackEvent } from "../../../../lib/analytics";
import { recordSpend } from "../../../../lib/corpusBudget";
import { rateLimit } from "../../../../lib/limits";
import {
  clearInFlightSearch,
  getInFlightSearch,
  searchWithBurstRetry,
  setInFlightSearch,
} from "../../../../lib/liveSearch";
import { getRoomsCollection } from "../../../../lib/mongodb";
import {
  OriginalVideoCandidate,
  originalVideoQuery,
  pickOriginalCandidateDetails,
  pickOriginalCandidates,
} from "../../../../lib/originalVideo";
import { lookupCorpusSong } from "../../../../lib/originalVideoLookup";
import { normalizeRoomId } from "../../../../lib/roomCode";
import { readCache, writeCache } from "../../../../lib/searchCache";
import { searchCacheKey } from "../../../../lib/searchQuery";
import { confirmDailyOut, searchQuotaSpent } from "../../../../lib/searchQuotaStatus";
import { VIDEO_ID_RE } from "../../../../lib/videoLink";
import { YoutubeApiError } from "../../../../lib/youtubeApi";

type OriginalVideoStatus = "ok" | "none" | "quota" | "busy" | "pending";
type OriginalVideoSource = "cache" | "live" | "quota" | "busy" | "none";

const MUSIC_VIDEO_AT_WINDOW_MS = 5 * 60 * 1000;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "POST") {
    await handlePost(req, res);
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  const rawRoomId = normalizeRoomId(req.query.id);
  const entryId = req.query.entryId;
  const from = req.query.from;
  if (
    typeof rawRoomId !== "string" ||
    typeof entryId !== "string" ||
    !entryId ||
    (from !== undefined && from !== "host")
  ) {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }
  const roomId: string = rawRoomId;
  // The host's swap card reads this route too, but must never spend a search,
  // bump musicVideoAt or count as a screen resolving a video.
  const isHostQuery = from === "host";

  if (!rateLimit(req, "original-video", 30, 60_000)) {
    res.status(429).json({ code: 429, message: "Too many requests, slow down." });
    return;
  }

  res.setHeader("Cache-Control", "private, no-store");

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

    if (!isHostQuery) {
      rooms
        .updateOne(
          {
            id: roomId,
            $or: [
              { musicVideoAt: { $exists: false } },
              { musicVideoAt: { $lt: new Date(Date.now() - MUSIC_VIDEO_AT_WINDOW_MS) } },
            ],
          },
          { $set: { musicVideoAt: new Date() } }
        )
        .catch(() => {});
    }

    const respond = async (
      status: OriginalVideoStatus,
      videoIds: string[],
      source: OriginalVideoSource,
      candidates: OriginalVideoCandidate[] = []
    ) => {
      if (!isHostQuery) {
        await trackEvent(req, "original_video_resolved", {
          roomId,
          source,
          found: videoIds.length > 0,
          expiresAt: new Date(Date.now() + SCREEN_EVENT_TTL_MS),
        });
      }
      res.status(200).json({ status, videoIds, picked: null, candidates });
    };

    if (entry.originalVideoId) {
      const override = entry.originalVideoId;
      const corpus = await lookupCorpusSong(entry.videoId);
      const q = originalVideoQuery(entry.songTitle, corpus);
      let candidates: OriginalVideoCandidate[] = [];
      if (q !== null) {
        const key = `original:${searchCacheKey(q)}`;
        const cached = await readCache(key);
        if (cached) candidates = pickOriginalCandidateDetails(cached.results);
      }
      res.status(200).json({ status: "ok", videoIds: [override], picked: override, candidates });
      return;
    }

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
      const candidates = pickOriginalCandidateDetails(cached.results);
      await respond(videoIds.length ? "ok" : "none", videoIds, "cache", candidates);
      return;
    }

    const pending = getInFlightSearch(key);
    if (pending) {
      const results = await pending;
      const videoIds = pickOriginalCandidates(results);
      const candidates = pickOriginalCandidateDetails(results);
      await respond(videoIds.length ? "ok" : "none", videoIds, "live", candidates);
      return;
    }

    if (isHostQuery) {
      // A spent day means no screen will resolve it either; "pending" would have
      // the card re-asking all night.
      const status: OriginalVideoStatus = (await searchQuotaSpent()) ? "quota" : "pending";
      res.status(200).json({ status, videoIds: [], picked: null, candidates: [] });
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
      const candidates = pickOriginalCandidateDetails(results);
      await respond(videoIds.length ? "ok" : "none", videoIds, "live", candidates);
    } finally {
      clearInFlightSearch(key, live);
    }
  } catch (e) {
    const respondErr = async (status: OriginalVideoStatus, source: OriginalVideoSource) => {
      if (!isHostQuery) {
        await trackEvent(req, "original_video_resolved", {
          roomId,
          source,
          found: false,
          expiresAt: new Date(Date.now() + SCREEN_EVENT_TTL_MS),
        });
      }
      res.status(200).json({ status, videoIds: [], picked: null, candidates: [] });
    };
    const limit = e instanceof YoutubeApiError ? e.limit : null;
    const dailyOut = await confirmDailyOut(limit);
    if (dailyOut) {
      await respondErr("quota", "quota");
      return;
    }
    if (limit !== null) {
      await respondErr("busy", "busy");
      return;
    }
    console.error("original-video resolve failed:", e);
    res.status(502).json({ code: 502, message: "Search is temporarily unavailable." });
  }
}

const OFFSET_MIN = -600;
const OFFSET_MAX = 600;

function isValidOffsetSeconds(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= OFFSET_MIN &&
    value <= OFFSET_MAX &&
    Math.round(value * 4) / 4 === value
  );
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const roomId = normalizeRoomId(req.query.id);
  if (typeof roomId !== "string") {
    res.status(400).json({ code: 400, message: "Invalid room ID." });
    return;
  }

  let body: { entryId?: unknown; videoId?: unknown; source?: unknown; offsetSeconds?: unknown };
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    res.status(400).json({ code: 400, message: "Invalid JSON body." });
    return;
  }
  if (!body || typeof body !== "object") {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  const { entryId } = body;
  if (typeof entryId !== "string" || !entryId) {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  if (body.offsetSeconds !== undefined) {
    await handleOffsetPost(req, res, roomId, entryId, body.offsetSeconds);
    return;
  }
  await handlePickPost(req, res, roomId, entryId, body.videoId, body.source);
}

async function handleOffsetPost(
  req: NextApiRequest,
  res: NextApiResponse,
  roomId: string,
  entryId: string,
  offsetSecondsRaw: unknown
) {
  if (!isValidOffsetSeconds(offsetSecondsRaw)) {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  if (!rateLimit(req, "original-video-offset", 60, 60_000)) {
    res.status(429).json({ code: 429, message: "Too many changes, slow down." });
    return;
  }

  try {
    const rooms = await getRoomsCollection();
    const result =
      offsetSecondsRaw === 0
        ? await rooms.updateOne(
            { id: roomId, "queue.id": entryId },
            { $unset: { "queue.$.originalOffsetSeconds": "" as const }, $set: { lastActivity: new Date() } }
          )
        : await rooms.updateOne(
            { id: roomId, "queue.id": entryId },
            { $set: { "queue.$.originalOffsetSeconds": offsetSecondsRaw, lastActivity: new Date() } }
          );
    if (result.matchedCount === 0) {
      res.status(404).json({ code: 404, message: "Entry not found." });
      return;
    }

    await trackEvent(req, "original_video_nudged", { roomId, offsetSeconds: offsetSecondsRaw });
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error("original-video offset failed:", e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}

async function handlePickPost(
  req: NextApiRequest,
  res: NextApiResponse,
  roomId: string,
  entryId: string,
  videoId: unknown,
  source: unknown
) {
  if (
    (videoId !== null && (typeof videoId !== "string" || !VIDEO_ID_RE.test(videoId))) ||
    (source !== "candidate" && source !== "link" && source !== "search")
  ) {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  if (!rateLimit(req, "original-video-pick", 20, 60_000)) {
    res.status(429).json({ code: 429, message: "Too many changes, slow down." });
    return;
  }

  try {
    const rooms = await getRoomsCollection();
    // A pick drops the nudge made against the previous video; MusicVideoCard mirrors this.
    const result =
      videoId === null
        ? await rooms.updateOne(
            { id: roomId, "queue.id": entryId },
            {
              $unset: {
                "queue.$.originalVideoId": "" as const,
                "queue.$.originalOffsetSeconds": "" as const,
              },
              $set: { lastActivity: new Date() },
            }
          )
        : await rooms.updateOne(
            { id: roomId, "queue.id": entryId },
            {
              $set: { "queue.$.originalVideoId": videoId, lastActivity: new Date() },
              $unset: { "queue.$.originalOffsetSeconds": "" as const },
            }
          );
    if (result.matchedCount === 0) {
      res.status(404).json({ code: 404, message: "Entry not found." });
      return;
    }

    await trackEvent(req, "original_video_swapped", { roomId, source });
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error("original-video pick failed:", e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
