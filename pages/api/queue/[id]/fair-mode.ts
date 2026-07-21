import { NextApiRequest, NextApiResponse } from "next";
import { trackEvent } from "../../../../lib/analytics";
import { arrivalOrder, fairOrder, withArrivalTimes } from "../../../../lib/fairQueue";
import { getRoomsCollection } from "../../../../lib/mongodb";
import { normalizeRoomId } from "../../../../lib/roomCode";

// Toggle fair rotation. Both directions re-sort the upcoming songs once,
// atomically: ON spaces singers out round-robin, OFF restores the order they
// were queued in. The queue-equality filter makes the write optimistic (same
// CAS style as reorder.ts), so a concurrent add/remove just retries the sort
// on a fresh snapshot instead of clobbering it.
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

  try {
    const collection = await getRoomsCollection();

    for (let attempt = 0; attempt < 3; attempt++) {
      const room = await collection.findOne({ id: roomId });
      if (!room) {
        res.status(404).json({ code: 404, message: "Room not found." });
        return;
      }

      // Both directions re-sort, so the toggle is a true undo: ON spaces the
      // singers out, OFF puts the room back in the order songs were queued.
      // History never moves or counts; the current song joins the round
      // counting but stays put (see lib/fairQueue for why that's guaranteed).
      const split = room.activeVideoIndex;
      // Record arrival times first: for a room queued before `addedAt`
      // existed, the array order IS the arrival order right up until the
      // line below reorders it, and then it is gone for good.
      const upcoming = withArrivalTimes(room.queue.slice(split));
      const newQueue = room.queue
        .slice(0, split)
        .concat(enabled ? fairOrder(upcoming) : arrivalOrder(upcoming));

      const result = await collection.updateOne(
        { id: roomId, queue: room.queue },
        { $set: { queue: newQueue, fairMode: enabled, lastActivity: new Date() } }
      );
      if (result.matchedCount > 0) {
        // Only after the write lands, so a retried/lost CAS can't log a
        // toggle that never happened.
        trackEvent(req, "fair_mode_toggled", { roomId, fairMode: enabled });
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
