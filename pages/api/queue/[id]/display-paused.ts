import { NextApiRequest, NextApiResponse } from "next";
import { getRoomsCollection } from "../../../../lib/mongodb";
import { normalizeRoomId } from "../../../../lib/roomCode";

/**
 * Reported by the display screen when someone pauses/resumes the video there,
 * so host controls can show the real playback state. A pause only sticks
 * while the room is playing — a report for a stopped room is meaningless.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  const roomId = normalizeRoomId(req.query.id);
  const paused = req.query.paused === "true";

  if (typeof roomId !== "string") {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  try {
    const collection = await getRoomsCollection();
    const result = paused
      ? await collection.updateOne(
          { id: roomId, isPlaying: true },
          { $set: { displayPaused: true, lastActivity: new Date() } }
        )
      : await collection.updateOne(
          { id: roomId },
          {
            $set: { lastActivity: new Date() },
            $unset: { displayPaused: "" },
          }
        );

    if (!paused && result.matchedCount === 0) {
      res.status(404).json({ code: 404, message: "Room not found." });
    } else {
      res.status(200).json({ code: 200, message: "Display state updated." });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
