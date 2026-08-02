import { NextApiRequest, NextApiResponse } from "next";
import { trackEvent } from "../../../../lib/analytics";
import { rateLimit } from "../../../../lib/limits";
import { getRoomsCollection } from "../../../../lib/mongodb";
import { normalizeRoomId } from "../../../../lib/roomCode";

// When the room has to be out — a booked private-karaoke slot, the neighbours'
// patience, a school night. Stored on the room so every host device, every
// phone and the TV all agree on the deadline.

// A slot that already ended is still meaningful for a minute or two (the host
// is looking at an overrun), but backdating hours would just mislabel the queue.
const MAX_PAST_MS = 15 * 60 * 1000;
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;

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

  const at = req.query.at;
  const clearing = at === "" || at === undefined || at === "clear";
  const endsAt = clearing ? null : Number(at);

  if (
    endsAt !== null &&
    (!Number.isFinite(endsAt) ||
      endsAt < Date.now() - MAX_PAST_MS ||
      endsAt > Date.now() + MAX_FUTURE_MS)
  ) {
    res.status(400).json({ code: 400, message: "Invalid end time." });
    return;
  }

  if (!rateLimit(req, "session-end", 20, 60_000)) {
    res.status(429).json({ code: 429, message: "Too many changes, slow down." });
    return;
  }

  try {
    const collection = await getRoomsCollection();
    const result = await collection.updateOne(
      { id: roomId },
      endsAt === null
        ? { $set: { lastActivity: new Date() }, $unset: { sessionEndsAt: "" } }
        : { $set: { sessionEndsAt: new Date(endsAt), lastActivity: new Date() } }
    );

    if (result.matchedCount === 0) {
      res.status(404).json({ code: 404, message: "Room not found." });
      return;
    }

    // Minutes, not a wall-clock time: how long organizers book a room for is the
    // interesting signal, and it carries no timezone to leak.
    trackEvent(req, "session_end_set", {
      roomId,
      minutesFromNow:
        endsAt === null ? null : Math.round((endsAt - Date.now()) / 60_000),
    });
    res.status(200).json({ code: 200, message: "Session end updated." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
