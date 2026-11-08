import { NextApiRequest, NextApiResponse } from "next";
import { ApiError, Reaction } from "../../types";
import { CHEER_EMOJIS, CHEER_SOURCES, CheerSource } from "../../../../app/queue/cheerConstants";
import { trackEvent } from "../../../../lib/analytics";
import { appendReaction, liveReactions, MAX_REACTIONS } from "../../../../lib/cheers";
import { sharesSinger } from "../../../../lib/fairQueue";
import { MAX_ENTRY_ID_LENGTH, MAX_NAME_LENGTH, rateLimit } from "../../../../lib/limits";
import { getRoomsCollection } from "../../../../lib/mongodb";
import { normalizeRoomId } from "../../../../lib/roomCode";

const ALLOWED_REACTIONS = new Set(CHEER_EMOJIS);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ reactions: Reaction[] } | ApiError>
) {
  if (req.method !== "POST") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  const roomId = normalizeRoomId(req.query.id);
  const emoji = req.query.emoji as string | undefined;
  const userName = typeof req.query.userName === "string" ? req.query.userName.trim() : "";
  const reactionId = req.query.reactionId as string | undefined;
  const clientId = typeof req.query.clientId === "string" ? req.query.clientId : undefined;
  // Unknown values drop rather than reject: an old client is no reason to lose the cheer.
  const source = (CHEER_SOURCES as readonly string[]).includes(req.query.source as string)
    ? (req.query.source as CheerSource)
    : undefined;

  if (typeof roomId !== "string" || !emoji || !reactionId) {
    res.status(400).json({ code: 400, message: "Missing required parameters." });
    return;
  }

  if (
    userName.length > MAX_NAME_LENGTH ||
    reactionId.length > MAX_ENTRY_ID_LENGTH ||
    (clientId !== undefined && clientId.length > MAX_ENTRY_ID_LENGTH)
  ) {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  if (!ALLOWED_REACTIONS.has(emoji)) {
    res.status(400).json({ code: 400, message: "Invalid reaction." });
    return;
  }

  // No per-person cooldown by design; reaction_sent's clientId is how per-sender bursts get measured.
  // Sized for a venue behind one NAT mid-burst.
  if (!rateLimit(req, "reaction", 60, 10_000)) {
    res.status(429).json({ code: 429, message: "Too fast! Wait a moment." });
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

    const now = Date.now();
    const reactions = liveReactions(room, now);

    const newReaction: Reaction = {
      id: reactionId,
      emoji,
      userName,
      timestamp: now,
    };

    const updated = [...reactions, newReaction].slice(-MAX_REACTIONS);

    await appendReaction(collection, roomId, newReaction);

    const tracked = trackEvent(req, "reaction_sent", {
      roomId: roomId as string,
      userName,
      emoji,
      // Spread, not undefined: the driver stores null, and absent means "older client" downstream.
      ...(clientId ? { clientId } : {}),
      ...(source ? { cheerSource: source } : {}),
      senderSang: room.queue.some((e) => sharesSinger(e.userName, userName)),
    });
    res.status(200).json({ reactions: updated });
    await tracked;
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
