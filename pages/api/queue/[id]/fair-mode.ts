import { NextApiRequest, NextApiResponse } from "next";
import { trackEvent } from "../../../../lib/analytics";
import { arrivalOrder, fairOrder, withArrivalTimes } from "../../../../lib/fairQueue";
import { rateLimit } from "../../../../lib/limits";
import { getRoomsCollection } from "../../../../lib/mongodb";
import { normalizeRoomId } from "../../../../lib/roomCode";

// Both directions re-sort the upcoming songs atomically. The queue-equality filter makes the write
// optimistic (same CAS style as reorder.ts), so a concurrent add/remove retries on a fresh snapshot.
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  const roomId = normalizeRoomId(req.query.id);
  const enabledParam = req.query.enabled;

  if (typeof roomId !== "string" || (enabledParam !== "true" && enabledParam !== "false")) {
    res.status(400).json({ code: 400, message: "Invalid request. 'enabled' must be 'true' or 'false'." });
    return;
  }

  const enabled = enabledParam === "true";

  // A toggle costs a room read plus a full-queue rewrite and an analytics doc — same cap as the config saves.
  if (!rateLimit(req, "fair-mode", 20, 60_000)) {
    res.status(429).json({ code: 429, message: "Too many toggles, slow down." });
    return;
  }

  try {
    const collection = await getRoomsCollection();

    for (let attempt = 0; attempt < 3; attempt++) {
      const room = await collection.findOne({ id: roomId });
      if (!room) {
        res.status(404).json({ code: 404, message: "Room not found." });
        return;
      }

      const split = room.activeVideoIndex;
      // Record arrival times first: for a legacy room the array order IS the arrival order, right up
      // until the line below reorders it for good.
      const upcoming = withArrivalTimes(room.queue.slice(split));
      const newQueue = room.queue
        .slice(0, split)
        .concat(enabled ? fairOrder(upcoming) : arrivalOrder(upcoming));

      // activeVideoIndex rides in the CAS: video-ended/position advance it WITHOUT touching the
      // queue array, and a re-sort computed against a stale split would move the now-playing song.
      const result = await collection.updateOne(
        { id: roomId, queue: room.queue, activeVideoIndex: split },
        { $set: { queue: newQueue, fairMode: enabled, lastActivity: new Date() } }
      );
      if (result.matchedCount > 0) {
        // Only after the write lands, so a lost CAS can't log a toggle that never happened.
        await trackEvent(req, "fair_mode_toggled", { roomId, fairMode: enabled });
        res.status(200).json({ code: 200, message: "Fair rotation toggled." });
        return;
      }
    }
    res.status(409).json({ code: 409, message: "Queue changed underneath you, try again." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
