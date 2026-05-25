import { MongoClient } from "mongodb";
import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "DELETE") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  const secret = req.headers["x-analytics-secret"] as string;
  if (!process.env.ANALYTICS_SECRET || secret !== process.env.ANALYTICS_SECRET) {
    res.status(401).json({ code: 401, message: "Unauthorized." });
    return;
  }

  const { roomId } = req.query;
  if (!roomId || typeof roomId !== "string") {
    res.status(400).json({ code: 400, message: "roomId is required." });
    return;
  }

  const client = new MongoClient(process.env.MONGODB_URI!);

  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB);

    const [events, sessions] = await Promise.all([
      db.collection("analytics_events").deleteMany({ roomId }),
      db.collection("analytics_sessions").deleteMany({ roomId }),
    ]);

    res.status(200).json({
      deleted: {
        events: events.deletedCount,
        sessions: sessions.deletedCount,
      },
    });
  } catch (e) {
    console.error("Room deletion error:", e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  } finally {
    await client.close();
  }
}
