import { NextApiRequest, NextApiResponse } from "next";
import { trackEvent } from "../../../../lib/analytics";
import { rateLimit } from "../../../../lib/limits";
import { getRoomsCollection } from "../../../../lib/mongodb";
import { normalizeRoomId } from "../../../../lib/roomCode";

// `after` is how many of the songs behind theirs go first, clamped to the queue's
// end, or "end". The entry is re-stamped as queued now, so a later fair-rotation
// re-sort keeps it back rather than restoring the slot it gave up.
//
// No ownership check, same as remove: the room code is the trust boundary.
export const MAX_POSTPONE_AFTER = 50;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  const roomId = normalizeRoomId(req.query.id);
  const entryId = req.query.entryId;
  const afterRaw = req.query.after;
  const toEnd = afterRaw === "end";
  const after = toEnd ? null : Number(afterRaw);

  if (
    typeof roomId !== "string" ||
    typeof entryId !== "string" ||
    (!toEnd && (!Number.isInteger(after) || after! < 1 || after! > MAX_POSTPONE_AFTER))
  ) {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  if (!rateLimit(req, "postpone", 20, 60_000)) {
    res.status(429).json({ code: 429, message: "Too many changes, slow down." });
    return;
  }

  try {
    const collection = await getRoomsCollection();

    // CAS on the queue snapshot (as reorder.ts does): an add or removal landing
    // between the read and the write just retries against the fresh array.
    for (let attempt = 0; attempt < 3; attempt++) {
      const room = await collection.findOne({ id: roomId });
      if (!room) {
        res.status(404).json({ code: 404, message: "Room not found." });
        return;
      }

      const index = room.queue.findIndex((e) => e.id === entryId);
      if (index === -1) {
        res.status(404).json({ code: 404, message: "Entry not found." });
        return;
      }
      // Sung already, or singing right now: nothing to push back. The active slot
      // while stopped is merely "up next" — exactly when a singer wants this.
      if (index < room.activeVideoIndex || (index === room.activeVideoIndex && room.isPlaying)) {
        res.status(409).json({ code: 409, message: "That song is already on stage." });
        return;
      }

      const target = toEnd
        ? room.queue.length - 1
        : Math.min(index + after!, room.queue.length - 1);
      if (target === index) {
        res.status(200).json({ code: 200, message: "Nothing behind it to move past." });
        return;
      }

      const entry = { ...room.queue[index], addedAt: Date.now() };
      const queue = room.queue.slice();
      queue.splice(index, 1);
      queue.splice(target, 0, entry);

      // activeVideoIndex is untouched: every move happens at or past it.
      const result = await collection.updateOne(
        { id: roomId, queue: room.queue },
        { $set: { queue, lastActivity: new Date() } }
      );
      if (result.matchedCount > 0) {
        await trackEvent(req, "song_postponed", {
          roomId,
          userName: entry.userName,
          postponedBy: toEnd ? "end" : after!,
        });
        res.status(200).json({ code: 200, message: "Song moved back." });
        return;
      }
    }
    res.status(409).json({ code: 409, message: "Queue changed underneath you, try again." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
