import { MongoClient } from "mongodb";
import { NextApiRequest, NextApiResponse } from "next";
import { ApiError, Reaction, Room } from "../../types";
import { CHEER_EMOJIS, CHEER_MESSAGES, REACTION_COOLDOWN_MS } from "../../../../app/queue/cheerConstants";
import { trackEvent } from "../../../../lib/analytics";

const RATE_LIMIT_MS = REACTION_COOLDOWN_MS;
const MAX_REACTIONS = 50;
const REACTION_TTL_MS = 30000;

const ALLOWED_REACTIONS = new Set([...CHEER_EMOJIS, ...CHEER_MESSAGES]);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ reactions: Reaction[] } | ApiError>
) {
  if (req.method !== "POST") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  const client = new MongoClient(process.env.MONGODB_URI!);
  const roomId = req.query.id;
  const emoji = req.query.emoji as string | undefined;
  const userName = req.query.userName as string | undefined;
  const reactionId = req.query.reactionId as string | undefined;

  if (typeof roomId !== "string" || !emoji || !userName || !reactionId) {
    res.status(400).json({ code: 400, message: "Missing required parameters." });
    return;
  }

  if (!ALLOWED_REACTIONS.has(emoji)) {
    res.status(400).json({ code: 400, message: "Invalid reaction." });
    return;
  }

  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB);
    const collection = db.collection<Room>("rooms");

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

    // Rate limit: check if this user reacted too recently
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

    await collection.updateOne(
      { id: roomId },
      { $set: { reactions: updated } }
    );

    trackEvent(req, "reaction_sent", { roomId: roomId as string, userName: userName!, emoji });
    res.status(200).json({ reactions: updated });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  } finally {
    await client.close();
  }
}
