import type { UpdateFilter } from "mongodb";
import { NextApiRequest, NextApiResponse } from "next";
import { Room } from "../../types";
import { getRoomsCollection } from "../../../../lib/mongodb";
import { normalizeRoomId } from "../../../../lib/roomCode";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  const roomId = normalizeRoomId(req.query.id);
  const isPlaying = req.query.isPlaying === "true";
  const playToken =
    typeof req.query.playToken === "string" && req.query.playToken
      ? req.query.playToken
      : null;

  if (typeof roomId !== "string") {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  try {
    const collection = await getRoomsCollection();
    const room = await collection.findOne({ id: roomId });

    if (!room) {
      res.status(404).json({ code: 404, message: "Room not found." });
    } else {
      // Starting a song records which device is the playback surface;
      // stopping clears it — no token means nothing is playing anywhere.
      // Either way a stale display-pause flag no longer applies.
      const update: UpdateFilter<Room> =
        isPlaying && playToken
          ? {
              $set: { isPlaying, playToken, playStartedAt: new Date(), lastActivity: new Date() },
              $unset: { displayPaused: "", playPausedAt: "" },
            }
          : isPlaying
            ? {
                $set: { isPlaying, playStartedAt: new Date(), lastActivity: new Date() },
                $unset: { displayPaused: "", playPausedAt: "" },
              }
            : {
                $set: { isPlaying, lastActivity: new Date() },
                $unset: { playToken: "", displayPaused: "", playStartedAt: "", playPausedAt: "" },
              };
      // A tokenless start is a surface-less remote command (co-host → whichever
      // screen holds the player). Both modes take it: a TV room's display obeys
      // isPlaying directly, and a here-mode host page claims the surface on its
      // next poll. The room GET stops an unclaimed here-mode start after the
      // grace window, so this can't strand playback with nothing playing it.
      const result = await collection.updateOne({ id: roomId }, update);
      if (result.matchedCount === 0) {
        res.status(404).json({ code: 404, message: "Room not found." });
        return;
      }
      res.status(200).json({ code: 200, message: "Play state updated." });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
