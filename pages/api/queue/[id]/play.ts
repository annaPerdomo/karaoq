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
  // A here-mode host page adopting someone else's surface-less start, rather
  // than a host deliberately starting a song here.
  const claim = req.query.claim === "1";

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
      // Three shapes of start, and only the host's own is unconditional:
      //
      // - claim: a here-mode host page adopting a surface-less start. CAS on the
      //   token still being absent, so of two visible host tabs exactly one wins
      //   and the loser yields instead of both playing the song out of sync.
      // - tokenless: a co-host's Play, which claims no surface. A TV room's
      //   display obeys isPlaying directly; in here-mode a host page claims it
      //   and the room GET heals the start if none does. Guarded on the room not
      //   already playing — a co-host's view can be a poll stale (queue edits
      //   hold polling), and re-landing this mid-song would rewrite
      //   playStartedAt and jump every phone's ETA back to a full song.
      // - tokened: the host starting here. Deliberate takeover, always wins.
      //
      // NB: only the stop branch clears playToken. The tokenless start must
      // leave it intact — unsetting it would orphan a running here-mode song,
      // and the GET's heal would cut it mid-performance 15s later.
      const filter = claim
        ? { id: roomId, isPlaying: true, playToken: { $exists: false } }
        : isPlaying && !playToken
          ? { id: roomId, isPlaying: { $ne: true } }
          : { id: roomId };
      const result = await collection.updateOne(filter, update);
      if (result.matchedCount === 0) {
        res.status(409).json({
          code: 409,
          message: claim
            ? "Another screen already claimed playback."
            : "Room is already playing.",
        });
        return;
      }
      res.status(200).json({ code: 200, message: "Play state updated." });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
