import { NextApiRequest, NextApiResponse } from "next";
import { normalizeSongLimit } from "../../types";
import { trackEvent } from "../../../../lib/analytics";
import { rateLimit } from "../../../../lib/limits";
import { getRoomsCollection } from "../../../../lib/mongodb";
import { normalizeRoomId } from "../../../../lib/roomCode";

// Independent of auto-advance: alone, the surface cuts the song and waits for
// Play; with both, the next singer follows on.
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
    res.status(400).json({ code: 400, message: "Invalid room ID." });
    return;
  }

  const raw = req.query.seconds;
  const clearing = raw === undefined || raw === "" || raw === "clear";
  const seconds = clearing ? null : normalizeSongLimit(Number(raw));
  if (!clearing && seconds === null) {
    res.status(400).json({ code: 400, message: "Invalid song limit." });
    return;
  }

  if (!rateLimit(req, "song-limit", 30, 60_000)) {
    res.status(429).json({ code: 429, message: "Too many changes, slow down." });
    return;
  }

  try {
    const collection = await getRoomsCollection();
    const result = await collection.updateOne(
      { id: roomId },
      seconds === null
        ? { $set: { lastActivity: new Date() }, $unset: { songLimitSeconds: "" } }
        : { $set: { songLimitSeconds: seconds, lastActivity: new Date() } }
    );
    if (result.matchedCount === 0) {
      res.status(404).json({ code: 404, message: "Room not found." });
      return;
    }

    await trackEvent(req, "song_limit_set", { roomId, songLimitSeconds: seconds });
    res.status(200).json({ code: 200, message: "Song limit updated." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
