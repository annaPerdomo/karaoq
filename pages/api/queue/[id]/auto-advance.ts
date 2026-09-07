import { NextApiRequest, NextApiResponse } from "next";
import { AutoAdvance, normalizeAutoAdvance } from "../../types";
import { trackEvent } from "../../../../lib/analytics";
import { rateLimit } from "../../../../lib/limits";
import { getRoomsCollection } from "../../../../lib/mongodb";
import { normalizeRoomId } from "../../../../lib/roomCode";
import { AUTO_START_STALE_MS } from "../../../../lib/autoAdvance";

// Switching off also drops any countdown: a display mid-countdown must not
// start under the old setting.
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

    if (req.query.arm === "1") {
      const room = await collection.findOne({ id: roomId });
      if (!room) {
        res.status(404).json({ code: 404, message: "Room not found." });
        return;
      }
      const gapMs = normalizeAutoAdvance(room.autoAdvance).gapSeconds * 1000;
      const now = Date.now();
      const autoStartAt = new Date(now + gapMs);
      // Only a lapsed stamp is re-timed: none at all means a Stop, Cancel or
      // manual-mode end told the room to hold, and re-arming would restart the halted song.
      const result = await collection.updateOne(
        {
          id: roomId,
          "autoAdvance.enabled": true,
          isPlaying: { $ne: true },
          autoStartAt: { $lt: new Date(now - AUTO_START_STALE_MS) },
          $and: [
            { $expr: { $gt: ["$activeVideoIndex", 0] } },
            { $expr: { $lt: ["$activeVideoIndex", { $size: "$queue" }] } },
          ],
        },
        { $set: { autoStartAt, lastActivity: new Date() } }
      );
      res.status(200).json({
        code: 200,
        message: result.matchedCount > 0 ? "Auto-start armed." : "Nothing to arm.",
        autoStartAt: result.matchedCount > 0 ? autoStartAt.toISOString() : null,
      });
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
    // Index 0 waits for the host's first Play, as video-ended never stamps a
    // first song; a host's own move (position route) counts in index 0 too.
    const betweenSongs =
      !room.isPlaying &&
      room.activeVideoIndex > 0 &&
      room.activeVideoIndex < room.queue.length;
    const restamped =
      config.enabled && running !== null && config.gapSeconds !== prev.gapSeconds
        ? new Date(running - prev.gapSeconds * 1000 + config.gapSeconds * 1000)
        : config.enabled && !prev.enabled && running === null && betweenSongs
          ? new Date(Date.now() + config.gapSeconds * 1000)
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
