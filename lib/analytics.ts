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

// Demo tooling (screenshot harnesses, promo-video capture scripts) sends this
// header on every request so the rooms it creates never reach analytics, even
// if a script is ever pointed at production instead of a local dev server.
export const DEMO_EXEMPT_HEADER = "x-karaoq-demo";

// localhost, loopback, and private-LAN hosts — matches a dev server reached as
// localhost:3000 as well as a phone on the same network hitting 192.168.x.x.
const LOCAL_HOST_PATTERN =
  /^(localhost|127(\.\d{1,3}){3}|\[::1\]|0\.0\.0\.0|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2})(:\d+)?$/i;

// Rooms used from local development or by demo tooling must not pollute
// production analytics. Checked at the write choke points below so every
// event type and session heartbeat is covered without touching call sites.
export function isAnalyticsExempt(req: NextApiRequest): boolean {
  if (headerString(req.headers[DEMO_EXEMPT_HEADER]) === "1") return true;
  const host = headerString(req.headers.host) ?? "";
  const forwardedHost = headerString(req.headers["x-forwarded-host"]) ?? "";
  return LOCAL_HOST_PATTERN.test(host) || LOCAL_HOST_PATTERN.test(forwardedHost);
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
  if (isAnalyticsExempt(req)) return;
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
  if (isAnalyticsExempt(req)) return;
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
