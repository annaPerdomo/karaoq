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
  // When a requester name is supplied, this is a singer removing their own post
  // and must match the poster. Host moderation calls omit it and pass through.
  const requester = typeof req.query.userName === "string" ? req.query.userName : undefined;
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
    const target = posts.find((p) => p.id === postId);
    if (!target) {
      res.status(404).json({ code: 404, message: "Post not found." });
      return;
    }
    if (requester !== undefined && target.createdBy !== requester) {
      res.status(403).json({ code: 403, message: "Only the person who posted this can remove it." });
      return;
    }

    // Atomic $pull — a $set of the filtered snapshot would delete any post
    // created between the read above and this write.
    await collection.updateOne(
      { id: roomId },
      { $pull: { singWithMe: { id: postId } }, $set: { lastActivity: new Date() } }
    );
    res.status(200).json({ code: 200, message: "Removed." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
