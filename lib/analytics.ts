import { MongoClient, type Db } from "mongodb";
import type { NextApiRequest } from "next";

export type EventType =
  | "room_created"
  | "song_added"
  | "search_performed"
  | "reaction_sent"
  | "session_heartbeat"
  | "qr_printed"
  | "suggestion_used";

export interface AnalyticsEvent {
  type: EventType;
  roomId: string;
  timestamp: Date;
  country?: string;
  region?: string;
  city?: string;
  userName?: string;
  songTitle?: string;
  videoId?: string;
  emoji?: string;
  role?: "host" | "singer" | "display";
  userAgent?: string;
  suggestionSource?: "random" | "song_pick" | "genre_chip";
  sectionId?: string;
  categoryId?: string;
}

function headerString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value || undefined;
}

function extractGeo(req: NextApiRequest) {
  return {
    country: headerString(req.headers["x-vercel-ip-country"]),
    region: headerString(req.headers["x-vercel-ip-region"]),
    city: headerString(req.headers["x-vercel-ip-city"]),
  };
}

async function getDb(): Promise<{ client: MongoClient; db: Db }> {
  const client = new MongoClient(process.env.MONGODB_URI!);
  await client.connect();
  return { client, db: client.db(process.env.MONGODB_DB) };
}

export async function trackEvent(
  req: NextApiRequest,
  type: EventType,
  data: Omit<AnalyticsEvent, "type" | "timestamp" | "country" | "region" | "city" | "userAgent">
): Promise<void> {
  let client: MongoClient | undefined;
  try {
    ({ client } = await getDb());
    const db = client.db(process.env.MONGODB_DB);
    const geo = extractGeo(req);
    const event: AnalyticsEvent = {
      type,
      timestamp: new Date(),
      userAgent: headerString(req.headers["user-agent"]),
      ...geo,
      ...data,
    };
    await db.collection("analytics_events").insertOne(event);
  } catch (e) {
    // Analytics should never break the main app flow
    console.error("Analytics tracking error:", e);
  } finally {
    if (client) await client.close();
  }
}

export async function trackSessionHeartbeat(
  req: NextApiRequest,
  roomId: string,
  userName: string,
  role: "host" | "singer" | "display",
  clientId?: string
): Promise<void> {
  let client: MongoClient | undefined;
  try {
    ({ client } = await getDb());
    const db = client.db(process.env.MONGODB_DB);
    const geo = extractGeo(req);
    const now = new Date();
    // Key on the stable per-browser clientId so name edits update the same
    // session doc instead of spawning a new one. Fall back to userName for
    // older clients that don't send a clientId.
    const sessionKey = `${roomId}:${clientId || userName}:${role}`;

    await db.collection("analytics_sessions").updateOne(
      { sessionKey },
      {
        $set: {
          roomId,
          userName,
          role,
          clientId,
          lastSeen: now,
          ...geo,
          userAgent: headerString(req.headers["user-agent"]),
        },
        $setOnInsert: {
          firstSeen: now,
        },
      },
      { upsert: true }
    );
  } catch (e) {
    console.error("Session tracking error:", e);
  } finally {
    if (client) await client.close();
  }
}
