import { NextApiRequest, NextApiResponse } from "next";
import { AutoAdvance, normalizeAutoAdvance } from "../../types";
import { trackEvent } from "../../../../lib/analytics";
import { rateLimit } from "../../../../lib/limits";
import { getRoomsCollection } from "../../../../lib/mongodb";
import { normalizeRoomId } from "../../../../lib/roomCode";

// Two jobs: POST ?cancel=1 drops a pending countdown; POST {enabled?, gapSeconds?}
// patches the setting (the song limit is its own route). Switching off also drops
// any countdown — a display mid-countdown must not start under the old setting.
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

  if (!rateLimit(req, "auto-advance", 30, 60_000)) {
    res.status(429).json({ code: 429, message: "Too many changes, slow down." });
    return;
  }

  try {
    const collection = await getRoomsCollection();

    if (req.query.cancel === "1") {
      const result = await collection.updateOne(
        { id: roomId },
        { $unset: { autoStartAt: "" }, $set: { lastActivity: new Date() } }
      );
      if (result.matchedCount === 0) {
        res.status(404).json({ code: 404, message: "Room not found." });
        return;
      }
      res.status(200).json({ code: 200, message: "Auto-start cancelled." });
      return;
    }

    let body: unknown;
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    } catch {
      res.status(400).json({ code: 400, message: "Invalid JSON body." });
      return;
    }
    if (!body || typeof body !== "object") {
      res.status(400).json({ code: 400, message: "Invalid auto-advance patch." });
      return;
    }

    const room = await collection.findOne({ id: roomId });
    if (!room) {
      res.status(404).json({ code: 404, message: "Room not found." });
      return;
    }

    // Merge over what's stored so a client can flip one field without knowing the
    // others. A room with no stored setting reads as off, so patching only its gap
    // leaves it off — chaining takes an explicit `enabled: true`.
    const prev = normalizeAutoAdvance(room.autoAdvance);
    const config: AutoAdvance = normalizeAutoAdvance({
      ...prev,
      ...(body as Record<string, unknown>),
    });

    // A gap change moves a running countdown: re-measure from when the breather
    // began. A stamp landing in the past fires on the surface's next tick.
    const running = room.autoStartAt ? new Date(room.autoStartAt).getTime() : null;
    const restamped =
      config.enabled && running !== null && config.gapSeconds !== prev.gapSeconds
        ? new Date(running - prev.gapSeconds * 1000 + config.gapSeconds * 1000)
        : null;

    await collection.updateOne(
      { id: roomId },
      !config.enabled
        ? {
            $set: { autoAdvance: config, lastActivity: new Date() },
            $unset: { autoStartAt: "" },
          }
        : restamped
          ? { $set: { autoAdvance: config, autoStartAt: restamped, lastActivity: new Date() } }
          : { $set: { autoAdvance: config, lastActivity: new Date() } }
    );

    await trackEvent(req, "auto_advance_set", { roomId, autoAdvance: config });
    res.status(200).json({ code: 200, message: "Auto-advance updated.", autoAdvance: config });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
