import { NextApiRequest, NextApiResponse } from "next";
import { ApiError, Reaction } from "../../types";
import { CHEER_EMOJIS, REACTION_COOLDOWN_MS } from "../../../../app/queue/cheerConstants";
import { trackEvent } from "../../../../lib/analytics";
import { MAX_ENTRY_ID_LENGTH, MAX_NAME_LENGTH, rateLimit } from "../../../../lib/limits";
import { getRoomsCollection } from "../../../../lib/mongodb";
import { normalizeRoomId } from "../../../../lib/roomCode";

const RATE_LIMIT_MS = REACTION_COOLDOWN_MS;
const MAX_REACTIONS = 50;
const REACTION_TTL_MS = 30000;

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
  const userName = req.query.userName as string | undefined;
  const reactionId = req.query.reactionId as string | undefined;

  if (typeof roomId !== "string" || !emoji || !userName || !reactionId) {
    res.status(400).json({ code: 400, message: "Missing required parameters." });
    return;
  }

  if (userName.length > MAX_NAME_LENGTH || reactionId.length > MAX_ENTRY_ID_LENGTH) {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  if (!ALLOWED_REACTIONS.has(emoji)) {
    res.status(400).json({ code: 400, message: "Invalid reaction." });
    return;
  }

  // The per-userName cooldown below is trivially bypassed by varying the
  // name; this IP-scoped limit is the real cap on doc bloat. Generous enough
  // for a venue's worth of guests behind one NAT during a hype burst.
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
    const reactions = (room.reactions ?? []).filter(
      (r) => now - r.timestamp < REACTION_TTL_MS
    );

    // Per-user rate limit.
    const lastReaction = reactions
      .filter((r) => r.userName === userName)
      .sort((a, b) => b.timestamp - a.timestamp)[0];

    if (lastReaction && now - lastReaction.timestamp < RATE_LIMIT_MS) {
      res.status(429).json({ code: 429, message: "Too fast! Wait a moment." });
      return;
    }

    const newReaction: Reaction = {
      id: reactionId,
      emoji,
      userName,
      timestamp: now,
    };

    const updated = [...reactions, newReaction].slice(-MAX_REACTIONS);

    // Atomic $push instead of a $set of the merged array: simultaneous
    // reactions used to collapse to ~1 as each write clobbered the others —
    // exactly during the hype bursts reactions exist for. $slice keeps the
    // doc bounded; expired entries age out of the window as new ones land.
    await collection.updateOne(
      { id: roomId },
      {
        $push: { reactions: { $each: [newReaction], $slice: -MAX_REACTIONS } },
        $set: { lastActivity: new Date() },
      }
    );

    trackEvent(req, "reaction_sent", { roomId: roomId as string, userName: userName!, emoji });
    res.status(200).json({ reactions: updated });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
