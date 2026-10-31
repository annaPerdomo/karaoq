import { NextApiRequest, NextApiResponse } from "next";
import { SCREEN_EVENT_TTL_MS, trackEvent } from "../../../../lib/analytics";
import { readSongCuts } from "../../../../lib/corpusRead";
import { findSongForQuery } from "../../../../lib/corpusLookup";
import { MAX_TITLE_LENGTH, rateLimit, sanitizeSongDuration } from "../../../../lib/limits";
import { getKaraokeVideosCollection, getRoomsCollection } from "../../../../lib/mongodb";
import { normalizeRoomId } from "../../../../lib/roomCode";
import { filterBlockedIds } from "../../../../lib/videoBlocklist";
import { VIDEO_ID_RE } from "../../../../lib/videoLink";
import type { OriginalVideoCandidate } from "../../../../lib/originalVideo";
import { recordSpend } from "../../../../lib/corpusBudget";
import {
  clearInFlightSearch,
  getInFlightSearch,
  searchWithBurstRetry,
  setInFlightSearch,
} from "../../../../lib/liveSearch";
import { readCache, writeCache, type SearchResult } from "../../../../lib/searchCache";
import { buildSearchQuery, hasSearchOperators, searchCacheKey } from "../../../../lib/searchQuery";
import { confirmDailyOut, searchQuotaSpent } from "../../../../lib/searchQuotaStatus";
import formatSongTitle from "../../../../lib/songTitle";
import { YoutubeApiError } from "../../../../lib/youtubeApi";

type CandidateStatus = "ok" | "none" | "quota" | "busy";

const MAX_CANDIDATES = 8;
// /api/search's freshness window, so an empty answer is trusted as long as a full one.
const FRESH_CACHE_MS = 14 * 24 * 60 * 60 * 1000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "POST") {
    await handlePost(req, res);
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  const roomId = normalizeRoomId(req.query.id);
  const entryId = req.query.entryId;
  if (typeof roomId !== "string" || typeof entryId !== "string" || !entryId) {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }
  if (!rateLimit(req, "karaoke-video", 30, 60_000)) {
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
    const entry = room?.queue.find((e) => e.id === entryId);
    if (!room || !entry) {
      res.status(404).json({ code: 404, message: "Entry not found." });
      return;
    }

    const songKey = (await songKeyForVideo(entry.videoId)) ?? (await findSongForQuery(entry.songTitle));
    const cuts = songKey ? await readSongCuts(songKey) : null;
    if (cuts && cuts.length > 0) {
      res.status(200).json({ status: "ok", candidates: toCandidates(cuts) });
      return;
    }
    const found = await searchForSong(req, entry.songTitle);
    res.status(200).json({
      status: found.status,
      candidates: toCandidates(await dropBlocked(found.results)),
    });
  } catch (e) {
    console.error("karaoke-video candidates failed:", e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}

function toCandidates(rows: SearchResult[]): OriginalVideoCandidate[] {
  return rows.slice(0, MAX_CANDIDATES).map((c) => ({
    videoId: c.videoId,
    title: c.title,
    ...(c.durationSeconds ? { durationSeconds: c.durationSeconds } : {}),
  }));
}

async function dropBlocked(rows: SearchResult[]): Promise<SearchResult[]> {
  if (rows.length === 0) return rows;
  const blocked = await filterBlockedIds(rows.map((r) => r.videoId));
  return rows.filter((r) => !blocked.has(r.videoId));
}

/** Keyed like /api/search's karaoke search; the query is the queued cut's title,
 *  so it shares the cache only when a singer searched that same text. */
async function searchForSong(
  req: NextApiRequest,
  songTitle: string
): Promise<{ status: CandidateStatus; results: SearchResult[] }> {
  // Cut titles often carry "|" or quotes; drop them rather than skip the search.
  const cleaned = formatSongTitle(songTitle).replace(/["|]/g, " ").replace(/(^|\s)[-#]+(?=\S)/g, "$1");
  const q = buildSearchQuery(cleaned, true);
  if (!q || hasSearchOperators(q)) return { status: "none", results: [] };
  const key = `${searchCacheKey(q)}|any|relevance`;
  const done = (results: SearchResult[]) => ({ status: (results.length ? "ok" : "none") as CandidateStatus, results });

  const cached = await readCache(key);
  if (cached && (cached.results.length > 0 || cached.ageMs < FRESH_CACHE_MS)) return done(cached.results);
  const pending = getInFlightSearch(key);
  if (pending) {
    try {
      return done(await pending);
    } catch {
      return { status: "busy", results: [] };
    }
  }
  if (await searchQuotaSpent()) return { status: "quota", results: cached?.results ?? [] };
  // The singer search's bucket: both draw on the same day's allowance.
  if (!rateLimit(req, "search", 10, 60_000)) return { status: "busy", results: [] };

  const live = searchWithBurstRetry(q, "any", "relevance");
  setInFlightSearch(key, live);
  try {
    const results = await live;
    writeCache(key, results);
    await recordSpend(Date.now(), { searches: 1 }).catch(() => {});
    return done(results);
  } catch (e) {
    const limit = e instanceof YoutubeApiError ? e.limit : null;
    if (await confirmDailyOut(limit)) return { status: "quota", results: [] };
    if (limit !== null) return { status: "busy", results: [] };
    throw e;
  } finally {
    clearInFlightSearch(key, live);
  }
}

async function songKeyForVideo(videoId: string): Promise<string | null> {
  const videos = await getKaraokeVideosCollection();
  const row = await videos.findOne({ _id: videoId }, { projection: { songKeys: 1 } });
  return row?.songKeys?.[0] ?? null;
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const roomId = normalizeRoomId(req.query.id);
  let body: Record<string, unknown>;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    res.status(400).json({ code: 400, message: "Invalid JSON body." });
    return;
  }
  const { entryId, videoId, title, durationSeconds, source } = body ?? {};
  if (
    typeof roomId !== "string" ||
    typeof entryId !== "string" ||
    !entryId ||
    typeof videoId !== "string" ||
    !VIDEO_ID_RE.test(videoId) ||
    typeof title !== "string" ||
    !title.trim() ||
    title.length > MAX_TITLE_LENGTH ||
    (source !== "candidate" && source !== "link" && source !== "search")
  ) {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }
  if (!rateLimit(req, "karaoke-video-pick", 20, 60_000)) {
    res.status(429).json({ code: 429, message: "Too many changes, slow down." });
    return;
  }

  try {
    if ((await filterBlockedIds([videoId])).has(videoId)) {
      res.status(422).json({ code: 422, message: "That video can't be played." });
      return;
    }

    const rooms = await getRoomsCollection();
    const room = await rooms.findOne(
      { id: roomId },
      { projection: { queue: 1, activeVideoIndex: 1, isPlaying: 1, playStartedAt: 1, playPausedAt: 1 } }
    );
    const index = room ? room.queue.findIndex((e) => e.id === entryId) : -1;
    if (!room || index === -1) {
      res.status(404).json({ code: 404, message: "Entry not found." });
      return;
    }
    if (index < room.activeVideoIndex) {
      res.status(409).json({ code: 409, message: "That song has already been sung." });
      return;
    }

    // A swapped live song restarts from the top, and so does its clock.
    const live = index === room.activeVideoIndex && room.isPlaying;
    const duration = sanitizeSongDuration(durationSeconds);
    const playStartedAt = new Date();
    const result = await rooms.updateOne(
      // Guarded on the stage it was read against: an advance in between would
      // otherwise restart the next singer's clock.
      { id: roomId, "queue.id": entryId, activeVideoIndex: room.activeVideoIndex, isPlaying: room.isPlaying },
      {
        $set: {
          "queue.$.videoId": videoId,
          "queue.$.songTitle": title.trim(),
          ...(duration ? { "queue.$.durationSeconds": duration } : {}),
          ...(live ? { playStartedAt } : {}),
          lastActivity: new Date(),
        },
        // A timing nudge was made against the old cut's intro.
        $unset: {
          "queue.$.originalOffsetSeconds": "" as const,
          ...(duration ? {} : { "queue.$.durationSeconds": "" as const }),
          ...(live ? { playPausedAt: "" as const, displayPaused: "" as const } : {}),
        },
      }
    );
    if (result.matchedCount === 0) {
      res.status(409).json({ code: 409, message: "The room moved on, try again." });
      return;
    }

    const old = room.queue[index];
    const playedMs =
      live && room.playStartedAt
        ? (room.playPausedAt ? new Date(room.playPausedAt) : playStartedAt).getTime() -
          new Date(room.playStartedAt).getTime()
        : null;
    // The old cut is the one the host rejected; its title and id expire at 30 days.
    await trackEvent(req, "karaoke_video_swapped", {
      roomId,
      source,
      live,
      ...(playedMs !== null && playedMs >= 0 ? { swapAtSeconds: Math.round(playedMs / 1000) } : {}),
      songTitle: old.songTitle,
      videoId: old.videoId,
      expiresAt: new Date(Date.now() + SCREEN_EVENT_TTL_MS),
    });
    res.status(200).json({ ok: true, playStartedAt: live ? playStartedAt.toISOString() : null });
  } catch (e) {
    console.error("karaoke-video swap failed:", e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
