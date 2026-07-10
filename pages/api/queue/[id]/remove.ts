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
    // Atomic $pull instead of a read-modify-write $set: a full-array write
    // from a stale snapshot would silently delete songs added concurrently.
    // The "before" image tells us exactly where the entry sat at pull time.
    const room = await collection.findOneAndUpdate(
      { id: roomId },
      { $pull: { queue: { id: entryId } }, $set: { lastActivity: new Date() } },
      { returnDocument: "before" }
    );

    if (!room) {
      res.status(404).json({ code: 404, message: "Room not found." });
      return;
    }

    const entryIndex = room.queue.findIndex((e) => e.id === entryId);
    if (entryIndex === -1) {
      res.status(404).json({ code: 404, message: "Entry not found." });
      return;
    }

    // Removing an entry before the current song shifts it down one slot. The
    // filter re-checks the index at write time so a concurrent advance or
    // removal can't be rewound by a stale decrement.
    // When removing the active song, keep the index — the next song slides
    // into place.  If nothing remains at that index, activeVideoIndex >= queue.length
    // and the UI correctly shows the empty state.
    await collection.updateOne(
      { id: roomId, activeVideoIndex: { $gt: entryIndex } },
      { $inc: { activeVideoIndex: -1 } }
    );
    res.status(200).json({ code: 200, message: "Entry removed." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
