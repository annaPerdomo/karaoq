import { NextApiRequest, NextApiResponse } from "next";
import { getRoomsCollection } from "../../../../lib/mongodb";
import { normalizeRoomId } from "../../../../lib/roomCode";
import { normalizeAutoAdvance } from "../../types";

/**
 * Reported by the display screen when the current video finishes, so the queue
 * advances even when the host controls live on a different device (the
 * BroadcastChannel fast path only reaches same-browser tabs).
 *
 * The update is guarded on `{ activeVideoIndex: endedIndex, isPlaying: true }`,
 * which makes duplicate reports (multiple screens showing the same room,
 * repeated YouTube end events) harmless no-ops.
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
  const endedIndex = Number(req.query.index);

  if (typeof roomId !== "string" || !Number.isInteger(endedIndex) || endedIndex < 0) {
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

    // Past the last song too — `queue.length` is the legitimate "queue
    // finished" state, and parking on the finished entry replays it ahead of
    // anything added afterwards.
    // A pipeline so the bound is `$size` at write time: removing the song that
    // just ended leaves both guarded fields untouched (remove.ts shifts the
    // index only when it is `$gt` the removal), so a length read above is stale.
    //
    // Auto-advance rides in the same write, $$REMOVE otherwise so a stale
    // countdown never survives an end. The gap is read off the room above: a
    // setting change racing this write is a few seconds nobody can notice.
    const gapMs = normalizeAutoAdvance(room.autoAdvance).gapSeconds * 1000;
    const result = await collection.updateOne(
      { id: roomId, activeVideoIndex: endedIndex, isPlaying: true },
      [
        {
          $set: {
            activeVideoIndex: {
              $min: [endedIndex + 1, { $size: "$queue" }],
            },
            isPlaying: false,
            lastActivity: new Date(),
            // The only route that means "sung to the end"; the host cheer keys on it.
            endedEntryId: { $arrayElemAt: ["$queue.id", endedIndex] },
            autoStartAt: {
              $cond: [
                {
                  $and: [
                    // Explicit true only, as normalizeAutoAdvance reads it: a
                    // room with no setting predates the feature.
                    { $eq: ["$autoAdvance.enabled", true] },
                    { $lt: [endedIndex + 1, { $size: "$queue" }] },
                  ],
                },
                new Date(Date.now() + gapMs),
                "$$REMOVE",
              ],
            },
          },
        },
        // playPausedAt goes with playStartedAt — a stamp that outlives its
        // song freezes the next one's clock at a pause that already ended.
        {
          $unset: ["playToken", "displayPaused", "playStartedAt", "playPausedAt"],
        },
      ]
    );

    res.status(200).json({
      code: 200,
      message: "Video end recorded.",
      advanced: result.modifiedCount > 0,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
