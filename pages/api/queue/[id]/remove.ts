import { NextApiRequest, NextApiResponse } from "next";
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
  const entryId = req.query.entryId;

  if (typeof roomId !== "string" || typeof entryId !== "string") {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  try {
    const collection = await getRoomsCollection();
    const room = await collection.findOne({ id: roomId });

    if (!room) {
      res.status(404).json({ code: 404, message: "Room not found." });
      return;
    }

    const entryIndex = room.queue.findIndex((e) => e.id === entryId);
    if (entryIndex === -1) {
      res.status(404).json({ code: 404, message: "Entry not found." });
      return;
    }

    const newQueue = room.queue.filter((e) => e.id !== entryId);

    // Adjust activeVideoIndex if removing an entry before the current song
    let newActiveIndex = room.activeVideoIndex;
    if (entryIndex < room.activeVideoIndex) {
      newActiveIndex = Math.max(0, newActiveIndex - 1);
    }
    // When removing the active song, keep the index — the next song slides
    // into place.  If nothing remains at that index, activeVideoIndex >= queue.length
    // and the UI correctly shows the empty state.

    await collection.updateOne(
      { id: roomId },
      { $set: { queue: newQueue, activeVideoIndex: newActiveIndex } }
    );
    res.status(200).json({ code: 200, message: "Entry removed." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
