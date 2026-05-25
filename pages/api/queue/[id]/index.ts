import { MongoClient } from "mongodb";
import { NextApiRequest, NextApiResponse } from "next";
import { ApiError, Room } from "../../types";
import { trackEvent } from "../../../../lib/analytics";

const REACTION_TTL_MS = 30000;

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
      const isCustom = req.headers["x-custom-code"] === "1";
      const existing = await collection.findOne({ id: roomId });
      if (existing && isCustom) {
        // Custom code already taken — tell the client to pick another
        res.status(409).json({ code: 409, message: "Room code already in use." });
      } else if (existing) {
        // Reset play state whenever host reconnects — they control when songs start
        await collection.updateOne({ id: roomId }, { $set: { isPlaying: false } });
        res.status(200).json({ ...existing, isPlaying: false });
      } else {
        const room: Room = { id: roomId, queue: [], activeVideoIndex: 0, isPlaying: false, reactionsEnabled: true };
        await collection.insertOne(room);
        trackEvent(req, "room_created", { roomId });
        res.status(201).json(room);
      }
    } else if (req.method === "GET") {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      const room = await collection.findOne({ id: roomId });
      if (room) {
        // Prune stale reactions and persist the cleanup
        const now = Date.now();
        const reactions = (room.reactions ?? []).filter(
          (r) => now - r.timestamp < REACTION_TTL_MS
        );
        if (reactions.length !== (room.reactions ?? []).length) {
          await collection.updateOne({ id: roomId }, { $set: { reactions } });
        }
        res.status(200).json({
          ...room,
          isPlaying: room.isPlaying ?? false,
          reactionsEnabled: room.reactionsEnabled ?? true,
          reactions,
        });
      } else {
        res.status(404).json({ code: 404, message: "Not found." });
      }
    } else {
      res.status(405).json({ code: 405, message: "Method not allowed." });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  } finally {
    await client.close();
  }
}
