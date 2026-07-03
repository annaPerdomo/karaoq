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
    const room = await collection.findOne({ id: roomId });

    if (!room) {
      res.status(404).json({ code: 404, message: "Room not found." });
    } else {
      await collection.updateOne(
        { id: roomId },
        { $set: { queue: body.queue, activeVideoIndex: body.activeVideoIndex, lastActivity: new Date() } }
      );
      res.status(200).json({ code: 200, message: "Queue reordered." });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
