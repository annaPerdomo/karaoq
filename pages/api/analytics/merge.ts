import { NextApiRequest, NextApiResponse } from "next";
import { getAnalyticsDb } from "../../../lib/mongodb";

// Merge the analytics for `source` into `target`, then remove `source`.
// Use this when a single real event ended up split across multiple room codes
// (e.g. the host restarted and got a fresh code mid-party).
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  const secret = req.headers["x-analytics-secret"] as string;
  if (!process.env.ANALYTICS_SECRET || secret !== process.env.ANALYTICS_SECRET) {
    res.status(401).json({ code: 401, message: "Unauthorized." });
    return;
  }

  let body: { source?: string; target?: string };
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!body || typeof body !== "object") throw new Error();
  } catch {
    res.status(400).json({ code: 400, message: "Invalid JSON body." });
    return;
  }

  const { source, target } = body;
  if (typeof source !== "string" || typeof target !== "string" || !source || !target) {
    res.status(400).json({ code: 400, message: "source and target are required." });
    return;
  }
  if (source === target) {
    res.status(400).json({ code: 400, message: "Cannot merge a room into itself." });
    return;
  }

  try {
    const db = await getAnalyticsDb();
    const events = db.collection("analytics_events");
    const sessions = db.collection("analytics_sessions");

    // Make sure the target is a real room — otherwise we'd reassign events into
    // a code that never appears in the Rooms list and orphan the source's data.
    const targetExists = await events.countDocuments(
      { roomId: target, type: "room_created" },
      { limit: 1 }
    );
    if (!targetExists) {
      res.status(404).json({ code: 404, message: "Target room not found." });
      return;
    }

    // Reassign every event except room_created — keeping the target's single
    // creation event so the merged room doesn't show up twice in the list.
    const reassigned = await events.updateMany(
      { roomId: source, type: { $ne: "room_created" } },
      { $set: { roomId: target } }
    );
    await events.deleteMany({ roomId: source, type: "room_created" });

    // Fold source sessions into target, deduping on (clientId|userName, role)
    // so the same person across both codes is counted once.
    const srcSessions = await sessions.find({ roomId: source }).toArray();
    for (const s of srcSessions) {
      const id = s.clientId || s.userName;
      const sessionKey = `${target}:${id}:${s.role}`;
      await sessions.updateOne(
        { sessionKey },
        {
          $set: {
            roomId: target,
            userName: s.userName,
            role: s.role,
            clientId: s.clientId,
            country: s.country,
            region: s.region,
            city: s.city,
            userAgent: s.userAgent,
          },
          $min: { firstSeen: s.firstSeen },
          $max: { lastSeen: s.lastSeen },
          $setOnInsert: { sessionKey },
        },
        { upsert: true }
      );
    }
    const removedSessions = await sessions.deleteMany({ roomId: source });

    res.status(200).json({
      merged: {
        source,
        target,
        events: reassigned.modifiedCount,
        sessions: removedSessions.deletedCount,
      },
    });
  } catch (e) {
    console.error("Room merge error:", e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
