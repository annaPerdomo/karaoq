import type { NextApiRequest } from "next";
import type { DisplayConfig, HostConfig } from "../pages/api/types";
import { getAnalyticsDb } from "./mongodb";
import type { Locale } from "./i18n/config";
import { asLocale, LOCALE_HEADER, type LocaleSource } from "./i18n/activeLocale";

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
  | "suggestion_claimed"
  | "display_config_saved"
  | "host_config_saved"
  | "fair_mode_toggled"
  | "session_end_set";

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
  // Absent on events from before this field existed, which were all search adds.
  via?: "search" | "board_claim" | "singwithme";
  // song_added: singers credited, counted the way fair rotation splits the name; absent pre-duets.
  singers?: number;
  // display_config_saved: fields differing from DEFAULT_DISPLAY_CONFIG.
  changedFields?: string[];
  displayConfig?: DisplayConfig;
  hostConfig?: HostConfig;
  // State switched TO on fair_mode_toggled; starting value on room_created. Absent pre-flag.
  fairMode?: boolean;
  // session_end_set: how far out the host set the end, or null when they cleared
  // it. A duration, not a wall-clock time — no timezone rides along.
  minutesFromNow?: number | null;
  locale?: Locale;
}

// Heartbeat gap beyond which the next beat starts a fresh session; 30 min tolerates throttled background-tab timers.
const SESSION_GAP_MS = 30 * 60 * 1000;

function headerString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value || undefined;
}

// Demo tooling sends this on every request so its rooms never reach analytics, even against production.
export const DEMO_EXEMPT_HEADER = "x-karaoq-demo";

// localhost, loopback, and private-LAN hosts (incl. phones hitting a 192.168.x.x dev server).
const LOCAL_HOST_PATTERN =
  /^(localhost|127(\.\d{1,3}){3}|\[::1\]|0\.0\.0\.0|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2})(:\d+)?$/i;

// Checked at the write choke points so every event type and heartbeat is covered without touching call sites.
export function isAnalyticsExempt(req: NextApiRequest): boolean {
  if (headerString(req.headers[DEMO_EXEMPT_HEADER]) === "1") return true;
  const host = headerString(req.headers.host) ?? "";
  const forwardedHost = headerString(req.headers["x-forwarded-host"]) ?? "";
  return LOCAL_HOST_PATTERN.test(host) || LOCAL_HOST_PATTERN.test(forwardedHost);
}

// LOCALE_HEADER lives in lib/i18n/activeLocale so client bundles can set it without pulling in this server-only module.
export function localeFromRequest(req: NextApiRequest): Locale | null {
  return asLocale(headerString(req.headers[LOCALE_HEADER]));
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
    const locale = localeFromRequest(req);
    const event: AnalyticsEvent = {
      type,
      timestamp: new Date(),
      userAgent: headerString(req.headers["user-agent"]),
      ...geo,
      ...(locale ? { locale } : {}),
      ...data,
    };
    await db.collection("analytics_events").insertOne(event);
  } catch (e) {
    console.error("Analytics tracking error:", e);
  }
}

export async function trackSessionHeartbeat(
  req: NextApiRequest,
  roomId: string,
  userName: string,
  role: "host" | "singer" | "display",
  clientId?: string,
  locale?: Locale,
  localeSource?: LocaleSource
): Promise<void> {
  if (isAnalyticsExempt(req)) return;
  try {
    const db = await getAnalyticsDb();
    const geo = extractGeo(req);
    const userAgent = headerString(req.headers["user-agent"]);
    const now = new Date();
    // Key on the stable clientId so name edits update the same doc; userName fallback for old clients.
    const sessionKey = `${roomId}:${clientId || userName}:${role}`;

    // $literal-wrap externally-supplied strings so e.g. a userName of "$role" isn't read as a field path.
    const set: Record<string, unknown> = {
      roomId: { $literal: roomId },
      userName: { $literal: userName },
      role: { $literal: role },
      lastSeen: now,
      // Keep the firstSeen anchor only while beats stay within SESSION_GAP_MS; otherwise reset it
      // so the span reflects one sitting, not the room's whole lifetime.
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
    if (locale) set.locale = { $literal: locale };
    if (localeSource) set.localeSource = { $literal: localeSource };
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
