import { NextApiRequest, NextApiResponse } from "next";
import { fairOrder } from "../../../../lib/fairQueue";
import { getRoomsCollection } from "../../../../lib/mongodb";
import { normalizeRoomId } from "../../../../lib/roomCode";

// Toggle fair rotation. Turning it OFF just clears the flag — the current
// order stays as-is. Turning it ON also re-sorts the upcoming songs once,
// atomically: the queue-equality filter makes the write optimistic (same CAS
// style as reorder.ts), so a concurrent add/remove just retries the sort on
// a fresh snapshot instead of clobbering it.
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  const roomId = normalizeRoomId(req.query.id);
  const enabledParam = req.query.enabled;

  if (typeof roomId !== "string" || (enabledParam !== "true" && enabledParam !== "false")) {
    res.status(400).json({ code: 400, message: "Invalid request. 'enabled' must be 'true' or 'false'." });
    return;
  }

  const enabled = enabledParam === "true";

  try {
    const collection = await getRoomsCollection();

    if (!enabled) {
      const result = await collection.updateOne(
        { id: roomId },
        { $set: { fairMode: false, lastActivity: new Date() } }
      );
      if (result.matchedCount === 0) {
        res.status(404).json({ code: 404, message: "Room not found." });
        return;
      }
      res.status(200).json({ code: 200, message: "Fair rotation toggled." });
      return;
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      const room = await collection.findOne({ id: roomId });
      if (!room) {
        res.status(404).json({ code: 404, message: "Room not found." });
        return;
      }

      // Never move the current song (or history) — only what's still upcoming.
      const split = room.activeVideoIndex + 1;
      const newQueue = room.queue
        .slice(0, split)
        .concat(fairOrder(room.queue.slice(split)));

      const result = await collection.updateOne(
        { id: roomId, queue: room.queue },
        { $set: { queue: newQueue, fairMode: true, lastActivity: new Date() } }
      );
      if (result.matchedCount > 0) {
        res.status(200).json({ code: 200, message: "Fair rotation toggled." });
        return;
      }
    }
    res.status(409).json({ code: 409, message: "Queue changed underneath you, try again." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
