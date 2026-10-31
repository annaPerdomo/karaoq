import { NextApiRequest, NextApiResponse } from "next";
import { trackEvent } from "../../../../lib/analytics";
import { readSongCuts } from "../../../../lib/corpusRead";
import { findSongForQuery } from "../../../../lib/corpusLookup";
import { MAX_TITLE_LENGTH, rateLimit, sanitizeSongDuration } from "../../../../lib/limits";
import { getKaraokeVideosCollection, getRoomsCollection } from "../../../../lib/mongodb";
import { normalizeRoomId } from "../../../../lib/roomCode";
import { filterBlockedIds } from "../../../../lib/videoBlocklist";
import { VIDEO_ID_RE } from "../../../../lib/videoLink";
import type { OriginalVideoCandidate } from "../../../../lib/originalVideo";

const MAX_CANDIDATES = 8;

/** GET reads corpus cuts only, never a YouTube search. */
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
    const candidates: OriginalVideoCandidate[] = (cuts ?? [])
      .slice(0, MAX_CANDIDATES)
      .map((c) => ({
        videoId: c.videoId,
        title: c.title,
        ...(c.durationSeconds ? { durationSeconds: c.durationSeconds } : {}),
      }));
    res.status(200).json({ candidates });
  } catch (e) {
    console.error("karaoke-video candidates failed:", e);
    res.status(500).json({ code: 500, message: "Internal server error." });
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
      { projection: { queue: 1, activeVideoIndex: 1, isPlaying: 1 } }
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

    await trackEvent(req, "karaoke_video_swapped", { roomId, source });
    res.status(200).json({ ok: true, playStartedAt: live ? playStartedAt.toISOString() : null });
  } catch (e) {
    console.error("karaoke-video swap failed:", e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
