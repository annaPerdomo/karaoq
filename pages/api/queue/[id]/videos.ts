import { NextApiRequest, NextApiResponse } from "next";
import { trackEvent } from "../../../../lib/analytics";
import { fairPushSpec, singerKeys } from "../../../../lib/fairQueue";
import {
  isValidQueueEntry,
  MAX_QUEUE_LENGTH,
  rateLimit,
  sanitizeSongDuration,
} from "../../../../lib/limits";
import { getRoomsCollection } from "../../../../lib/mongodb";
import { normalizeRoomId } from "../../../../lib/roomCode";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  const roomId = normalizeRoomId(req.query.id);

  if (typeof roomId !== "string") {
    res.status(400).json({ code: 400, message: "Invalid room ID." });
    return;
  }

  let body: {
    entryId: string;
    userName: string;
    videoId: string;
    songTitle: string;
    durationSeconds?: unknown;
  };
  try {
    const parsed = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!parsed || typeof parsed !== "object") throw new Error();
    body = parsed;
  } catch {
    res.status(400).json({ code: 400, message: "Invalid JSON body." });
    return;
  }

  const { entryId, userName, videoId, songTitle } = body;
  const base = { id: entryId, userName, videoId, songTitle };

  if (!isValidQueueEntry(base)) {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  // Implausible metadata is dropped, not rejected — the song still queues, it
  // just falls back to the room's average length in the time estimate.
  const durationSeconds = sanitizeSongDuration(body.durationSeconds);

  // Stamped server-side, never taken from the body: queue time decides the running order, so a
  // client must not be able to backdate itself to the front.
  const entry = {
    ...base,
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    addedAt: Date.now(),
  };

  if (!rateLimit(req, "song-add", 15, 30_000)) {
    res.status(429).json({ code: 429, message: "Too many songs added, slow down." });
    return;
  }

  try {
    const collection = await getRoomsCollection();
    const room = await collection.findOne({ id: roomId });

    if (!room) {
      res.status(404).json({ code: 404, message: "Room not found." });
    } else if (room.queue.length >= MAX_QUEUE_LENGTH) {
      res.status(409).json({ code: 409, message: "Queue is full." });
    } else {
      // Cap enforced in the filter so concurrent adds can't overshoot it between the length check
      // and the write; excluding fair-mode rooms keeps this single write the whole non-fair cost.
      const cap = { $lt: [{ $size: "$queue" }, MAX_QUEUE_LENGTH] };
      const plainAppend = {
        $push: { queue: entry },
        $set: { lastActivity: new Date() },
      };
      const result = await collection.updateOne(
        { id: roomId, fairMode: { $ne: true }, $expr: cap },
        plainAppend
      );

      if (result.matchedCount === 0) {
        // Fair mode (or filled up concurrently): insert at the round-robin slot. CAS on the queue
        // snapshot — $position is only right for the exact array it was computed against.
        let inserted = false;
        for (let attempt = 0; attempt < 3 && !inserted; attempt++) {
          const fresh = await collection.findOne({ id: roomId });
          if (!fresh) {
            res.status(404).json({ code: 404, message: "Room not found." });
            return;
          }
          if (fresh.queue.length >= MAX_QUEUE_LENGTH) {
            res.status(409).json({ code: 409, message: "Queue is full." });
            return;
          }
          if (!fresh.fairMode) break; // toggled off mid-flight — plain append below

          // Fairness only places NEW songs — an add never re-sorts what's queued, so manual host reordering survives.
          // activeVideoIndex rides in the CAS: video-ended/position advance it WITHOUT touching the
          // queue array, and a stale $position can land on the now-playing slot.
          const insert = await collection.updateOne(
            {
              id: roomId,
              queue: fresh.queue,
              activeVideoIndex: fresh.activeVideoIndex,
              $expr: cap,
            },
            {
              $push: {
                queue: fairPushSpec(fresh.queue, fresh.activeVideoIndex, entry),
              },
              $set: { lastActivity: new Date() },
            }
          );
          inserted = insert.matchedCount > 0;
        }

        if (!inserted) {
          // A song must never be lost to fairness: after CAS exhaustion, fall back to the plain capped append.
          const fallback = await collection.updateOne(
            { id: roomId, $expr: cap },
            plainAppend
          );
          if (fallback.matchedCount === 0) {
            res.status(409).json({ code: 409, message: "Queue is full." });
            return;
          }
        }
      }
      // singerKeys is what fair rotation splits by, so the duet count matches the turns charged.
      trackEvent(req, "song_added", {
        roomId: roomId as string,
        userName,
        songTitle,
        videoId,
        via: "search",
        singers: singerKeys(userName).length,
      });
      res.status(200).json({ code: 200, message: "Song added." });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
