import { NextApiRequest, NextApiResponse } from "next";
import { rateLimit } from "../../../../lib/limits";
import { getRoomsCollection } from "../../../../lib/mongodb";
import { normalizeRoomId } from "../../../../lib/roomCode";

/** Unlike display-seen this bumps lastActivity: a deliberate host action should wake a dormant room's slow display poll. */
const MIN_GAP_MS = 5000;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  const roomId = normalizeRoomId(req.query.id);
  if (typeof roomId !== "string") {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  if (!rateLimit(req, "screen-test", 10, 60_000)) {
    res.status(429).json({ code: 429, message: "Too fast, slow down." });
    return;
  }

  try {
    const collection = await getRoomsCollection();
    const now = new Date();
    // At most one card per MIN_GAP_MS: anyone with the room code can call this, and each card covers the display.
    const result = await collection.updateOne(
      {
        id: roomId,
        $or: [
          { screenTestAt: { $exists: false } },
          { screenTestAt: { $lt: new Date(now.getTime() - MIN_GAP_MS) } },
        ],
      },
      { $set: { screenTestAt: now, lastActivity: now } }
    );
    if (result.matchedCount > 0) {
      res.status(200).json({ ok: true });
    } else if (await collection.countDocuments({ id: roomId }, { limit: 1 })) {
      res.status(200).json({ ok: true });
    } else {
      res.status(404).json({ code: 404, message: "Room not found." });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
