import { NextApiRequest, NextApiResponse } from "next";
import { DisplayConfig } from "../../types";
import { isValidDisplayConfig } from "../../../../lib/limits";
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

  const config: DisplayConfig = { ...body, welcomeLine: body.welcomeLine.trim() };

  try {
    const collection = await getRoomsCollection();
    const result = await collection.updateOne(
      { id: roomId },
      { $set: { displayConfig: config, lastActivity: new Date() } }
    );
    if (result.matchedCount === 0) {
      res.status(404).json({ code: 404, message: "Room not found." });
      return;
    }
    res.status(200).json({ code: 200, message: "Display config updated." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
