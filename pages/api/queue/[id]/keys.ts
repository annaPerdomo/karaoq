import { NextApiRequest, NextApiResponse } from "next";
import { ApiError } from "../../types";
import { rateLimit } from "../../../../lib/limits";
import { getRoomsCollection } from "../../../../lib/mongodb";
import { normalizeRoomId } from "../../../../lib/roomCode";
import { allows, hashRoomKey, mintRoomKey, roomKeyFromRequest } from "../../../../lib/roomKeys";

// A cap on cohost keys only — host and display entries are never evicted.
const MAX_COHOST_KEYS = 20;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ roomKey: string; roomKeyRole: "cohost" } | ApiError>
) {
  if (req.method !== "POST") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  const roomId = normalizeRoomId(req.query.id);
  if (typeof roomId !== "string") {
    res.status(400).json({ code: 400, message: "Invalid room ID." });
    return;
  }

  let body: unknown;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    res.status(400).json({ code: 400, message: "Invalid JSON body." });
    return;
  }
  const role = (body as { role?: unknown } | null)?.role;
  if (role !== "cohost") {
    res.status(400).json({ code: 400, message: "Invalid role." });
    return;
  }

  if (!rateLimit(req, "room-key-mint", 20, 300_000)) {
    res.status(429).json({ code: 429, message: "Too many keys minted, try again later." });
    return;
  }

  try {
    const collection = await getRoomsCollection();
    const keyRoom = await collection.findOne({ id: roomId }, { projection: { keys: 1 } });
    if (!keyRoom) {
      res.status(404).json({ code: 404, message: "Room not found." });
      return;
    }
    // A legacy room has nothing to protect, and the client never calls this endpoint for one.
    if (!allows(keyRoom, roomKeyFromRequest(req), ["host"]) || !keyRoom.keys?.length) {
      res.status(403).json({ code: 403, message: "room-key" });
      return;
    }

    const cohostKeys = (keyRoom.keys ?? []).filter((k) => k.role === "cohost");
    if (cohostKeys.length >= MAX_COHOST_KEYS) {
      const oldest = cohostKeys.reduce((a, b) => (a.createdAt < b.createdAt ? a : b));
      await collection.updateOne({ id: roomId }, { $pull: { keys: { hash: oldest.hash } } });
    }

    const roomKey = mintRoomKey();
    await collection.updateOne(
      { id: roomId },
      {
        $push: { keys: { hash: hashRoomKey(roomKey), role: "cohost", createdAt: new Date() } },
        $set: { lastActivity: new Date() },
      }
    );
    res.status(200).json({ roomKey, roomKeyRole: "cohost" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
