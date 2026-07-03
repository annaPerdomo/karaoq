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
  // When a requester name is supplied, this is a singer withdrawing their own
  // suggestion and must match the suggester. Host moderation calls omit it.
  const requester = typeof req.query.userName === "string" ? req.query.userName : undefined;
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
    const target = suggestions.find((s) => s.id === suggestionId);
    if (!target) {
      res.status(404).json({ code: 404, message: "Suggestion not found." });
      return;
    }
    if (requester !== undefined && target.suggestedBy !== requester) {
      res.status(403).json({ code: 403, message: "Only the person who suggested this can remove it." });
      return;
    }

    const next = suggestions.filter((s) => s.id !== suggestionId);

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
