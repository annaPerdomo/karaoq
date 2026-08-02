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
    const now = new Date();
    const result = paused
      ? await collection.updateOne(
          { id: roomId, isPlaying: true },
          // playPausedAt freezes the queue-time estimate: without it a pizza
          // break keeps burning the on-stage song's clock, and every ETA in the
          // room runs early by however long the room stood still.
          { $set: { displayPaused: true, playPausedAt: now, lastActivity: now } }
        )
      : await collection.updateOne({ id: roomId }, [
          // Pipeline update so the resume is one atomic write: push
          // playStartedAt forward by however long the pause lasted, so the song
          // reads as where it actually is rather than where it would have been.
          {
            $set: {
              playStartedAt: {
                $cond: [
                  {
                    $and: [
                      { $ne: [{ $type: "$playPausedAt" }, "missing"] },
                      { $ne: [{ $type: "$playStartedAt" }, "missing"] },
                    ],
                  },
                  {
                    $add: [
                      "$playStartedAt",
                      { $subtract: [now, "$playPausedAt"] },
                    ],
                  },
                  "$playStartedAt",
                ],
              },
              lastActivity: now,
            },
          },
          { $unset: ["displayPaused", "playPausedAt"] },
        ]);

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
