import { MongoClient } from "mongodb";
import { NextApiRequest, NextApiResponse } from "next";
import { ApiError, Room } from "../../types";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Room | ApiError>
) {
  const client = new MongoClient(process.env.MONGODB_URI!);
  const roomId = req.query.id;

  if (typeof roomId !== "string") {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB);
    const collection = db.collection<Room>("rooms");

    if (req.method === "POST") {
      const existing = await collection.findOne({ id: roomId });
      if (existing) {
        res.status(200).json(existing);
      } else {
        const room: Room = { id: roomId, queue: [], activeVideoIndex: 0 };
        await collection.insertOne(room);
        res.status(201).json(room);
      }
    } else if (req.method === "GET") {
      const room = await collection.findOne({ id: roomId });
      if (room) {
        res.status(200).json(room);
      } else {
        res.status(404).json({ code: 404, message: "Not found." });
      }
    } else {
      res.status(400).json({ code: 400, message: "Invalid request." });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  } finally {
    await client.close();
  }
}
