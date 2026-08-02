import { NextApiRequest, NextApiResponse } from "next";
import { getRoomsCollection } from "../../../../lib/mongodb";
import { normalizeRoomId } from "../../../../lib/roomCode";

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

    // Advance to the next song when there is one; either way the song stops
    // and waits for the host to start the next one (same behavior as the
    // host-side end handling).
    const hasNext = endedIndex + 1 < room.queue.length;
    const update = hasNext
      ? { activeVideoIndex: endedIndex + 1, isPlaying: false }
      : { isPlaying: false };

    const result = await collection.updateOne(
      { id: roomId, activeVideoIndex: endedIndex, isPlaying: true },
      {
        $set: { ...update, lastActivity: new Date() },
        // playPausedAt goes with playStartedAt — a stamp that outlives its
        // song freezes the next one's clock at a pause that already ended.
        $unset: {
          playToken: "",
          displayPaused: "",
          playStartedAt: "",
          playPausedAt: "",
        },
      }
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
