import type { NextApiRequest } from "next";
import { getAnalyticsDb } from "./mongodb";

export type EventType =
  | "room_created"
  | "song_added"
  | "search_performed"
  | "reaction_sent"
  | "session_heartbeat"
  | "qr_printed"
  | "suggestion_used"
  | "singwithme_posted"
  | "singwithme_joined"
  | "singwithme_queued"
  | "song_suggested"
  | "suggestion_claimed";

export interface AnalyticsEvent {
  type: EventType;
  roomId: string;
  timestamp: Date;
  country?: string;
  region?: string;
  city?: string;
  userName?: string;
  songTitle?: string;
  songArtist?: string;
  videoId?: string;
  emoji?: string;
  role?: "host" | "singer" | "display";
  userAgent?: string;
  suggestionSource?: "random" | "song_pick" | "genre_chip" | "trending";
  sectionId?: string;
  categoryId?: string;
  // How a song_added event reached the queue. Absent on events from before
  // this field existed, which were all search adds.
  via?: "search" | "board_claim" | "singwithme";
}

// A heartbeat fires every 60s while a tab is open. If more than this elapses
// between heartbeats for the same room+browser, the tab was closed (or the room
// revisited days later), so the next beat starts a fresh session rather than
// stretching the old one's span. 30 min tolerates a briefly backgrounded tab
// whose timers were throttled without splitting a genuine continuous session.
const SESSION_GAP_MS = 30 * 60 * 1000;

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

export async function trackEvent(
  req: NextApiRequest,
  type: EventType,
  data: Omit<AnalyticsEvent, "type" | "timestamp" | "country" | "region" | "city" | "userAgent">
): Promise<void> {
  try {
    const db = await getAnalyticsDb();
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
  }
}

export async function trackSessionHeartbeat(
  req: NextApiRequest,
  roomId: string,
  userName: string,
  role: "host" | "singer" | "display",
  clientId?: string
): Promise<void> {
  try {
    const db = await getAnalyticsDb();
    const geo = extractGeo(req);
    const userAgent = headerString(req.headers["user-agent"]);
    const now = new Date();
    // Key on the stable per-browser clientId so name edits update the same
    // session doc instead of spawning a new one. Fall back to userName for
    // older clients that don't send a clientId.
    const sessionKey = `${roomId}:${clientId || userName}:${role}`;

    // $literal-wrap externally-supplied strings so a value like a userName of
    // "$role" can't be misread as a field path inside the update pipeline.
    const set: Record<string, unknown> = {
      roomId: { $literal: roomId },
      userName: { $literal: userName },
      role: { $literal: role },
      lastSeen: now,
      // Anchor firstSeen at the start of the *current* session. Keep the
      // existing anchor only while heartbeats stay within SESSION_GAP_MS;
      // otherwise (a reopened tab or a room revisited days later) reset it so
      // the session's span reflects one sitting, not the room's whole lifetime.
      firstSeen: {
        $cond: [
          {
            $and: [
              { $ne: [{ $type: "$lastSeen" }, "missing"] },
              { $lte: [{ $subtract: [now, "$lastSeen"] }, SESSION_GAP_MS] },
            ],
          },
          "$firstSeen",
          now,
        ],
      },
    };
    if (clientId !== undefined) set.clientId = { $literal: clientId };
    if (geo.country) set.country = { $literal: geo.country };
    if (geo.region) set.region = { $literal: geo.region };
    if (geo.city) set.city = { $literal: geo.city };
    if (userAgent) set.userAgent = { $literal: userAgent };

    await db.collection("analytics_sessions").updateOne(
      { sessionKey },
      [{ $set: set }],
      { upsert: true }
    );
  } catch (e) {
    console.error("Session tracking error:", e);
  }
}
