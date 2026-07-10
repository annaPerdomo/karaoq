import { NextApiRequest, NextApiResponse } from "next";
import { QueueEntry } from "../../types";
import { isValidQueueEntry, MAX_QUEUE_LENGTH } from "../../../../lib/limits";
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

  let body: { queue: QueueEntry[]; activeVideoIndex: number };
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    res.status(400).json({ code: 400, message: "Invalid JSON body." });
    return;
  }

  if (
    !Array.isArray(body.queue) ||
    body.queue.length > MAX_QUEUE_LENGTH ||
    !body.queue.every(isValidQueueEntry) ||
    typeof body.activeVideoIndex !== "number" ||
    !Number.isInteger(body.activeVideoIndex) ||
    body.activeVideoIndex < 0 ||
    body.activeVideoIndex > body.queue.length
  ) {
    res.status(400).json({ code: 400, message: "Invalid request body." });
    return;
  }

  try {
    const collection = await getRoomsCollection();
    // The host's snapshot can be up to ~8s stale, so a raw $set of the payload
    // would delete songs added since (and resurrect ones removed since).
    // Instead, rebuild the queue from the server doc in the client's id
    // order: entries the payload doesn't know about are appended, payload
    // entries no longer on the server are dropped. The queue-equality filter
    // makes the write optimistic — a concurrent write between the read and
    // the update just retries the merge.
    for (let attempt = 0; attempt < 3; attempt++) {
      const room = await collection.findOne({ id: roomId });

      if (!room) {
        res.status(404).json({ code: 404, message: "Room not found." });
        return;
      }

      const serverEntries = new Map(room.queue.map((e) => [e.id, e]));
      const merged: QueueEntry[] = [];
      for (const e of body.queue) {
        const entry = serverEntries.get(e.id);
        if (entry) {
          merged.push(entry);
          serverEntries.delete(e.id);
        }
      }
      for (const e of room.queue) {
        if (serverEntries.has(e.id)) merged.push(e);
      }

      const result = await collection.updateOne(
        { id: roomId, queue: room.queue },
        {
          $set: {
            queue: merged,
            activeVideoIndex: Math.min(body.activeVideoIndex, merged.length),
            lastActivity: new Date(),
          },
        }
      );
      if (result.matchedCount > 0) {
        res.status(200).json({ code: 200, message: "Queue reordered." });
        return;
      }
    }
    res.status(409).json({ code: 409, message: "Queue changed underneath you, try again." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
