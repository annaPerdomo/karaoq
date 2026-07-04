import { NextApiRequest, NextApiResponse } from "next";
import { getRoomsCollection } from "../../../../lib/mongodb";
import { normalizeRoomId } from "../../../../lib/roomCode";

/**
 * Display heartbeat. Deliberately does NOT bump lastActivity: a forgotten
 * display tab shouldn't keep an abandoned room from expiring.
 */
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
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  try {
    const collection = await getRoomsCollection();
    const result = await collection.updateOne(
      { id: roomId },
      { $set: { displayLastSeen: new Date() } }
    );

    if (result.matchedCount === 0) {
      res.status(404).json({ code: 404, message: "Room not found." });
    } else {
      res.status(200).json({ code: 200, message: "Display seen." });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
