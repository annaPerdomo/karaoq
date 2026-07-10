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
  // Strict parse (parseInt would accept "3.9" as 3) — this lands straight in
  // activeVideoIndex, which the players trust.
  const activeVideoIndex = Number(req.query.activeVideoIndex);

  if (
    typeof roomId !== "string" ||
    !Number.isInteger(activeVideoIndex) ||
    activeVideoIndex < 0
  ) {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  try {
    const collection = await getRoomsCollection();
    const room = await collection.findOne({ id: roomId });

    if (!room) {
      res.status(404).json({ code: 404, message: "Room not found." });
    } else {
      // Clamp to just past the last entry (== queue.length is the legitimate
      // "queue finished" empty state, same bound video-ended enforces).
      const nextIndex = Math.min(activeVideoIndex, room.queue.length);
      await collection.updateOne(
        { id: roomId },
        {
          $set: { activeVideoIndex: nextIndex, isPlaying: false, lastActivity: new Date() },
          $unset: { playToken: "", displayPaused: "", playStartedAt: "" },
        }
      );
      res.status(200).json({ code: 200, message: "Position updated." });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
