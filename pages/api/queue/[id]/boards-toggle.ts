import { NextApiRequest, NextApiResponse } from "next";
import { trackEvent } from "../../../../lib/analytics";
import { rateLimit } from "../../../../lib/limits";
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
  const enabledParam = req.query.enabled;

  if (typeof roomId !== "string" || (enabledParam !== "true" && enabledParam !== "false")) {
    res.status(400).json({ code: 400, message: "Invalid request. 'enabled' must be 'true' or 'false'." });
    return;
  }

  const enabled = enabledParam === "true";

  // Every accepted toggle writes an analytics doc — same cap as the config saves.
  if (!rateLimit(req, "boards-toggle", 20, 60_000)) {
    res.status(429).json({ code: 429, message: "Too many toggles, slow down." });
    return;
  }

  try {
    const collection = await getRoomsCollection();
    const room = await collection.findOne({ id: roomId });

    if (!room) {
      res.status(404).json({ code: 404, message: "Room not found." });
    } else {
      await collection.updateOne(
        { id: roomId },
        { $set: { boardsOnDisplay: enabled } }
      );
      // boardsOnDisplay defaults to ON, so turning boards OFF is the deviation.
      await trackEvent(req, "display_config_saved", {
        roomId,
        changedFields: enabled ? [] : ["boardsOnDisplay"],
      });
      res.status(200).json({ code: 200, message: "Boards on display toggled." });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
