import { MongoClient } from "mongodb";
import { NextApiRequest, NextApiResponse } from "next";
import { Room } from "../../types";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  const client = new MongoClient(process.env.MONGODB_URI!);
  const roomId = req.query.id;
  const enabledParam = req.query.enabled;

  if (typeof roomId !== "string" || (enabledParam !== "true" && enabledParam !== "false")) {
    res.status(400).json({ code: 400, message: "Invalid request. 'enabled' must be 'true' or 'false'." });
    return;
  }

  const enabled = enabledParam === "true";

  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB);
    const collection = db.collection<Room>("rooms");
    const room = await collection.findOne({ id: roomId });

    if (!room) {
      res.status(404).json({ code: 404, message: "Room not found." });
    } else {
      await collection.updateOne(
        { id: roomId },
        { $set: { reactionsEnabled: enabled } }
      );
      res.status(200).json({ code: 200, message: "Reactions toggled." });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  } finally {
    await client.close();
  }
}
