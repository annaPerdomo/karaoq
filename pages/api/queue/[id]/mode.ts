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
  const playMode = req.query.playMode;

  if (typeof roomId !== "string" || (playMode !== "here" && playMode !== "tv")) {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  try {
    const collection = await getRoomsCollection();
    const result = await collection.updateOne(
      { id: roomId },
      { $set: { playMode, lastActivity: new Date() } }
    );

    if (result.matchedCount === 0) {
      res.status(404).json({ code: 404, message: "Room not found." });
    } else {
      res.status(200).json({ code: 200, message: "Play mode updated." });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
