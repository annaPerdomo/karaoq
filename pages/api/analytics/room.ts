import { NextApiRequest, NextApiResponse } from "next";
import { getAnalyticsDb } from "../../../lib/mongodb";
import type { AnalyticsEvent } from "../../../lib/analytics";

// Per-room detail: who joined, what they added, what they requested, and
// their sing-with-me activity. Read-only view for the admin dashboard.
async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  roomId: string
) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  const db = await getAnalyticsDb();

  // People who joined: one session doc per (clientId, role). Exclude displays
  // (TVs, not people) — same rule the head count on the rooms list uses.
  const sessionsPromise = db
    .collection("analytics_sessions")
    .find({ roomId, role: { $ne: "display" } })
    .sort({ firstSeen: 1 })
    .limit(500)
    .toArray();

  // All activity events, oldest first. Partitioned by type below.
  const eventsPromise = db
    .collection<AnalyticsEvent>("analytics_events")
    .find({
      roomId,
      type: {
        $in: [
          "song_added",
          "song_suggested",
          "singwithme_posted",
          "singwithme_joined",
          "singwithme_queued",
          "reaction_sent",
          "search_performed",
        ],
      },
    })
    .sort({ timestamp: 1 })
    .limit(2000)
    .toArray();

  const [sessions, events] = await Promise.all([sessionsPromise, eventsPromise]);

  const people = sessions.map((s) => ({
    userName: s.userName ?? null,
    role: s.role ?? null,
    firstSeen: s.firstSeen ?? null,
    lastSeen: s.lastSeen ?? null,
    country: s.country ?? null,
    city: s.city ?? null,
  }));

  const songs: unknown[] = [];
  const requests: unknown[] = [];
  const singWithMe: unknown[] = [];
  let reactions = 0;
  let searches = 0;

  for (const e of events) {
    switch (e.type) {
      case "song_added":
        songs.push({
          userName: e.userName ?? null,
          songTitle: e.songTitle ?? null,
          videoId: e.videoId ?? null,
          via: e.via ?? "search",
          timestamp: e.timestamp,
        });
        break;
      case "song_suggested":
        requests.push({
          userName: e.userName ?? null,
          songTitle: e.songTitle ?? null,
          videoId: e.videoId ?? null,
          timestamp: e.timestamp,
        });
        break;
      case "singwithme_posted":
      case "singwithme_joined":
      case "singwithme_queued":
        singWithMe.push({
          kind: e.type.replace("singwithme_", ""), // posted | joined | queued
          userName: e.userName ?? null,
          songTitle: e.songTitle ?? null,
          videoId: e.videoId ?? null,
          timestamp: e.timestamp,
        });
        break;
      case "reaction_sent":
        reactions += 1;
        break;
      case "search_performed":
        searches += 1;
        break;
    }
  }

  res.status(200).json({
    roomId,
    people,
    songs,
    requests,
    singWithMe,
    counts: {
      people: people.length,
      songs: songs.length,
      requests: requests.length,
      singWithMe: singWithMe.length,
      reactions,
      searches,
    },
  });
}

async function handleDelete(
  res: NextApiResponse,
  roomId: string
) {
  const db = await getAnalyticsDb();

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
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET" && req.method !== "DELETE") {
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

  try {
    if (req.method === "GET") {
      await handleGet(req, res, roomId);
    } else {
      await handleDelete(res, roomId);
    }
  } catch (e) {
    console.error("Room detail error:", e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
