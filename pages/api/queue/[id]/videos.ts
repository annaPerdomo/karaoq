import { NextApiRequest, NextApiResponse } from "next";
import { trackEvent } from "../../../../lib/analytics";
import { isValidQueueEntry, MAX_QUEUE_LENGTH, rateLimit } from "../../../../lib/limits";
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

  let body: { entryId: string; userName: string; videoId: string; songTitle: string };
  try {
    const parsed = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!parsed || typeof parsed !== "object") throw new Error();
    body = parsed;
  } catch {
    res.status(400).json({ code: 400, message: "Invalid JSON body." });
    return;
  }

  const { entryId, userName, videoId, songTitle } = body;
  const entry = { id: entryId, userName, videoId, songTitle };

  if (!isValidQueueEntry(entry)) {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

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
      // Cap enforced in the filter so concurrent adds can't overshoot it
      // between the length check above and the write.
      const result = await collection.updateOne(
        { id: roomId, $expr: { $lt: [{ $size: "$queue" }, MAX_QUEUE_LENGTH] } },
        {
          $push: { queue: entry },
          $set: { lastActivity: new Date() },
        }
      );
      if (result.matchedCount === 0) {
        res.status(409).json({ code: 409, message: "Queue is full." });
        return;
      }
      trackEvent(req, "song_added", { roomId: roomId as string, userName, songTitle, videoId, via: "search" });
      res.status(200).json({ code: 200, message: "Song added." });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
