import { NextApiRequest, NextApiResponse } from "next";
import { MAX_NAME_LENGTH } from "../../../../lib/limits";
import { getRoomsCollection } from "../../../../lib/mongodb";
import { normalizeRoomId } from "../../../../lib/roomCode";

// Rename the singer on one queue entry (the host's inline edit). Positional
// $set touches only that entry, so concurrent queue writes are never clobbered.
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
  const userName = req.query.userName;

  if (
    typeof roomId !== "string" ||
    typeof entryId !== "string" ||
    typeof userName !== "string" ||
    userName.length > MAX_NAME_LENGTH
  ) {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  try {
    const collection = await getRoomsCollection();
    const result = await collection.updateOne(
      { id: roomId, "queue.id": entryId },
      { $set: { "queue.$.userName": userName, lastActivity: new Date() } }
    );
    if (result.matchedCount === 0) {
      res.status(404).json({ code: 404, message: "Room or entry not found." });
      return;
    }
    res.status(200).json({ code: 200, message: "Renamed." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
