import { NextApiRequest, NextApiResponse } from "next";
import { getRoomsCollection } from "../../../../lib/mongodb";
import { normalizeRoomId } from "../../../../lib/roomCode";

/**
 * Display teardown signal, sent via navigator.sendBeacon when the display tab
 * is being closed. Backdates displayLastSeen so the very next host poll sees
 * the display as gone — no waiting out the ~75s heartbeat TTL. A hard kill
 * (crash, power off) that never sends this still self-heals via that TTL.
 *
 * Deliberately never resurrects a room's activity: like the heartbeat, this
 * must not keep an abandoned room alive. It also only clears the timestamp, so
 * a display that fired this on a reload simply re-heartbeats moments later.
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

  if (typeof roomId !== "string") {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  try {
    const collection = await getRoomsCollection();
    await collection.updateOne(
      { id: roomId },
      { $set: { displayLastSeen: new Date(0) } }
    );
    res.status(200).json({ code: 200, message: "Display gone." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
