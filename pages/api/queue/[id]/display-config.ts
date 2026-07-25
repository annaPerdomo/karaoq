import { NextApiRequest, NextApiResponse } from "next";
import {
  DisplayConfig,
  displayConfigChangedFields,
  normalizeDisplayConfig,
} from "../../types";
import { trackEvent } from "../../../../lib/analytics";
import { isValidDisplayConfig, rateLimit } from "../../../../lib/limits";
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

  if (typeof roomId !== "string") {
    res.status(400).json({ code: 400, message: "Invalid room ID." });
    return;
  }

  let body: unknown;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    res.status(400).json({ code: 400, message: "Invalid JSON body." });
    return;
  }

  if (!isValidDisplayConfig(body)) {
    res.status(400).json({ code: 400, message: "Invalid display config." });
    return;
  }

  // Optional: the display's Customize mode saves boardsOnDisplay in the same
  // action. Absent means "leave it alone" (the host page's own writes).
  const boardsParam = req.query.boardsOnDisplay;
  if (boardsParam !== undefined && boardsParam !== "true" && boardsParam !== "false") {
    res.status(400).json({ code: 400, message: "Invalid boardsOnDisplay." });
    return;
  }
  const boardsOnDisplay =
    boardsParam === undefined ? undefined : boardsParam === "true";

  // Every accepted save also writes an analytics doc carrying the whole config,
  // so an unthrottled endpoint grows the events collection without bound.
  if (!rateLimit(req, "display-config", 20, 60_000)) {
    res.status(429).json({ code: 429, message: "Too many saves, slow down." });
    return;
  }

  // Older host clients POST configs without the drag-era fields — store them
  // complete so every stored config is fully-populated.
  const config: DisplayConfig = {
    ...normalizeDisplayConfig(body),
    bannerLine: body.bannerLine.trim(),
  };

  try {
    const collection = await getRoomsCollection();
    const result = await collection.updateOne(
      { id: roomId },
      {
        $set: {
          displayConfig: config,
          lastActivity: new Date(),
          ...(boardsOnDisplay === undefined ? {} : { boardsOnDisplay }),
        },
      }
    );
    if (result.matchedCount === 0) {
      res.status(404).json({ code: 404, message: "Room not found." });
      return;
    }
    // With the designer's explicit Apply button, one event per save — low
    // volume, and the changed-vs-default fields show which defaults hosts
    // actually override.
    // boardsOnDisplay defaults to ON, so hiding boards is the deviation.
    const changedFields: string[] = displayConfigChangedFields(config);
    if (boardsOnDisplay === false) changedFields.push("boardsOnDisplay");
    await trackEvent(req, "display_config_saved", {
      roomId,
      changedFields,
      displayConfig: config,
    });
    res.status(200).json({ code: 200, message: "Display config updated." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
