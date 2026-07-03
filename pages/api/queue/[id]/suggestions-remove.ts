import { NextApiRequest, NextApiResponse } from "next";
import { getRoomsCollection } from "../../../../lib/mongodb";
import { normalizeRoomId } from "../../../../lib/roomCode";

// Remove a suggestion (host moderation, or suggester withdrawing it).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  const roomId = normalizeRoomId(req.query.id);
  const suggestionId = req.query.suggestionId;
  if (typeof roomId !== "string" || typeof suggestionId !== "string") {
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

    const suggestions = room.suggestions ?? [];
    const next = suggestions.filter((s) => s.id !== suggestionId);
    if (next.length === suggestions.length) {
      res.status(404).json({ code: 404, message: "Suggestion not found." });
      return;
    }

    await collection.updateOne(
      { id: roomId },
      { $set: { suggestions: next, lastActivity: new Date() } }
    );
    res.status(200).json({ code: 200, message: "Removed." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
