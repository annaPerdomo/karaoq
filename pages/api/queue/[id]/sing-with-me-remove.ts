import { NextApiRequest, NextApiResponse } from "next";
import { getRoomsCollection } from "../../../../lib/mongodb";
import { normalizeRoomId } from "../../../../lib/roomCode";

// Remove a "Sing with me" post (host moderation, or poster clearing their own).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  const roomId = normalizeRoomId(req.query.id);
  const postId = req.query.postId;
  if (typeof roomId !== "string" || typeof postId !== "string") {
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

    const posts = room.singWithMe ?? [];
    const next = posts.filter((p) => p.id !== postId);
    if (next.length === posts.length) {
      res.status(404).json({ code: 404, message: "Post not found." });
      return;
    }

    await collection.updateOne(
      { id: roomId },
      { $set: { singWithMe: next, lastActivity: new Date() } }
    );
    res.status(200).json({ code: 200, message: "Removed." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
