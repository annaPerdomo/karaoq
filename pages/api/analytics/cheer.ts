import { NextApiRequest, NextApiResponse } from "next";
import { CHEER_EMOJIS } from "../../../app/queue/cheerConstants";
import { isAuthorizedAdmin } from "../../../lib/adminAuth";
import { trackEvent } from "../../../lib/analytics";
import { appendReaction } from "../../../lib/cheers";
import { getRoomsCollection } from "../../../lib/mongodb";
import { normalizeRoomId, ROOM_CODE_PATTERN } from "../../../lib/roomCode";

export const ADMIN_CHEER_NAME = "KaraoQ";
const ALLOWED = new Set(CHEER_EMOJIS);

/** A cheer from Mission Control: the same $push a phone's cheer makes. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }
  if (!isAuthorizedAdmin(req)) {
    res.status(401).json({ code: 401, message: "Unauthorized." });
    return;
  }

  let body: { roomId?: unknown; emoji?: unknown };
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!body || typeof body !== "object") throw new Error();
  } catch {
    res.status(400).json({ code: 400, message: "Invalid JSON body." });
    return;
  }
  const roomId = typeof body.roomId === "string" ? normalizeRoomId(body.roomId) : null;
  const emoji = body.emoji;
  if (
    typeof roomId !== "string" ||
    !ROOM_CODE_PATTERN.test(roomId) ||
    typeof emoji !== "string" ||
    !ALLOWED.has(emoji)
  ) {
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
    if (room.reactionsEnabled === false) {
      res.status(403).json({ code: 403, message: "Reactions are disabled." });
      return;
    }
    if (!room.isPlaying) {
      res.status(409).json({ code: 409, message: "Nothing is playing in this room." });
      return;
    }

    const reaction = {
      id: `admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      emoji,
      userName: ADMIN_CHEER_NAME,
      timestamp: Date.now(),
    };
    await appendReaction(collection, roomId, reaction);
    await trackEvent(req, "admin_cheer_sent", { roomId, emoji });
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
