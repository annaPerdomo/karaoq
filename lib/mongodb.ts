import { MongoClient, type Collection, type Db } from "mongodb";
import type { FeedbackEntry, Room } from "../pages/api/types";
import type { EventType } from "./analytics";
import { YOUTUBE_DATA_MAX_AGE_DAYS } from "./youtubeRetention";

// Reuse one connected client per serverless instance instead of opening and
// closing a fresh TCP+TLS connection on every request/tracked event. Stored on
// globalThis so dev-mode module reloads don't leak connections.
const globalForMongo = globalThis as unknown as {
  _karaoqMongoClient?: Promise<MongoClient>;
};

async function connectClient(): Promise<MongoClient> {
  const client = new MongoClient(process.env.MONGODB_URI!);
  await client.connect();
  return client;
}

export function getMongoClient(): Promise<MongoClient> {
  if (!globalForMongo._karaoqMongoClient) {
    globalForMongo._karaoqMongoClient = connectClient().catch((e) => {
      // Drop the failed promise so the next request retries the connection.
      globalForMongo._karaoqMongoClient = undefined;
      throw e;
    });
  }
  return globalForMongo._karaoqMongoClient;
}

// Rooms expire 30 days after their last write (song add, playback change,
// reaction, host reconnect). Long enough that "what was that room code from
// last weekend?" still works; short enough that abandoned rooms don't
// accumulate against the Atlas free-tier storage cap.
export const ROOM_EXPIRY_SECONDS = 30 * 24 * 60 * 60;

// Entries are only *served* for 24h (FRESH_CACHE_MS in pages/api/search.ts);
// they're retained well past that purely as a fallback for when YouTube is
// unreachable or the daily search quota is spent. YouTube's Developer Policies
// cap storage of non-authorized API data at 30 days, so stay comfortably under.
const SEARCH_CACHE_TTL_SECONDS = 14 * 24 * 60 * 60;

let roomIndexesEnsured = false;

function ensureRoomIndexes(db: Db): void {
  if (roomIndexesEnsured) return;
  roomIndexesEnsured = true;
  try {
    Promise.all([
      db.collection("rooms").createIndex({ id: 1 }, { unique: true }),
      db.collection("rooms").createIndex(
        { lastActivity: 1 },
        { expireAfterSeconds: ROOM_EXPIRY_SECONDS }
      ),
      // createIndex won't change expireAfterSeconds on an index that already
      // exists (it errors with IndexOptionsConflict), so fall back to collMod
      // to retune the TTL in place — otherwise a changed retention window
      // silently never reaches a database that's already been indexed.
      // Swallowed rather than rejected: a failed retune leaves the old TTL
      // working, whereas failing the batch un-latches roomIndexesEnsured and
      // makes every polled request re-issue the whole batch.
      db
        .collection("search_cache")
        .createIndex(
          { createdAt: 1 },
          { expireAfterSeconds: SEARCH_CACHE_TTL_SECONDS }
        )
        .catch(() =>
          db.command({
            collMod: "search_cache",
            index: {
              keyPattern: { createdAt: 1 },
              expireAfterSeconds: SEARCH_CACHE_TTL_SECONDS,
            },
          })
        )
        .catch((e) => {
          console.error("search_cache TTL retune failed:", e);
        }),
      db.collection("search_cache").createIndex({ key: 1 }, { unique: true }),
    ]).catch((e) => {
      console.error("Room index creation failed:", e);
      roomIndexesEnsured = false;
    });
  } catch (e) {
    console.error("Room index creation failed:", e);
  }
}

export async function getRoomsCollection(): Promise<Collection<Room>> {
  const client = await getMongoClient();
  const db = client.db(process.env.MONGODB_DB);
  ensureRoomIndexes(db);
  return db.collection<Room>("rooms");
}

interface SearchCacheDoc {
  key: string;
  results: { title: string; thumbnailUrl: string; videoId: string }[];
  createdAt: Date;
}

export async function getSearchCacheCollection(): Promise<Collection<SearchCacheDoc>> {
  const client = await getMongoClient();
  const db = client.db(process.env.MONGODB_DB);
  ensureRoomIndexes(db);
  return db.collection<SearchCacheDoc>("search_cache");
}

// Cached "trending on karaoq" aggregates, refreshed lazily (first request
// after the doc goes stale recomputes it). TTL is a safety net well past the
// 24h refresh window so unused country keys eventually disappear.
const SUGGESTION_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface SuggestionCacheDoc {
  key: string;
  items: { title: string; artist: string; count: number }[];
  computedAt: Date;
}

let suggestionIndexesEnsured = false;

export async function getSuggestionCacheCollection(): Promise<Collection<SuggestionCacheDoc>> {
  const client = await getMongoClient();
  const db = client.db(process.env.MONGODB_DB);
  if (!suggestionIndexesEnsured) {
    suggestionIndexesEnsured = true;
    Promise.all([
      db.collection("suggestion_cache").createIndex({ key: 1 }, { unique: true }),
      db.collection("suggestion_cache").createIndex(
        { computedAt: 1 },
        { expireAfterSeconds: SUGGESTION_CACHE_TTL_SECONDS }
      ),
    ]).catch((e) => {
      console.error("Suggestion cache index creation failed:", e);
      suggestionIndexesEnsured = false;
    });
  }
  return db.collection<SuggestionCacheDoc>("suggestion_cache");
}

// What an analytics event knows about a *YouTube video* lives here rather than
// on the event, because the two have opposite lifetimes: the event is kept
// forever (the long-term funnel counts it), while YouTube's Developer Policies
// (III.E.4) cap API data at 30 days. Split, a TTL index does the enforcing — no
// job that can fail to run, and no query that can read expired data, since it
// is gone.
const YOUTUBE_SONG_DATA_TTL_SECONDS = YOUTUBE_DATA_MAX_AGE_DAYS * 24 * 60 * 60;

export interface YoutubeSongDataDoc {
  /** Matches `songDataId` on the analytics event this belongs to. */
  dataId: string;
  roomId: string;
  type: EventType;
  /** Mirrors the event's country so per-country trending can be computed here. */
  country?: string;
  songTitle?: string;
  songArtist?: string;
  videoId?: string;
  /** Drives the TTL index; mirrors the event's own timestamp. */
  timestamp: Date;
}

let songDataIndexesEnsured = false;

export async function getYoutubeSongDataCollection(): Promise<Collection<YoutubeSongDataDoc>> {
  const client = await getMongoClient();
  const db = client.db(process.env.MONGODB_DB);
  if (!songDataIndexesEnsured) {
    songDataIndexesEnsured = true;
    // Index setup is best-effort and must never take the write down with it:
    // an event losing its song is a worse outcome than a missing index.
    try {
      Promise.all([
        db.collection("youtube_song_data").createIndex({ dataId: 1 }, { unique: true }),
        db.collection("youtube_song_data").createIndex({ roomId: 1 }),
        // Serves both the top-songs ranking and per-country trending.
        db.collection("youtube_song_data").createIndex({ type: 1, timestamp: -1 }),
        // Policy compliance, not housekeeping — see above. createIndex won't
        // change the window on an existing index, so collMod retunes it, for
        // the same reason search_cache does.
        db
          .collection("youtube_song_data")
          .createIndex({ timestamp: 1 }, { expireAfterSeconds: YOUTUBE_SONG_DATA_TTL_SECONDS })
          .catch(() =>
            db.command({
              collMod: "youtube_song_data",
              index: {
                keyPattern: { timestamp: 1 },
                expireAfterSeconds: YOUTUBE_SONG_DATA_TTL_SECONDS,
              },
            })
          )
          .catch((e) => {
            console.error("youtube_song_data TTL retune failed:", e);
          }),
      ]).catch((e) => {
        console.error("Song data index creation failed:", e);
        songDataIndexesEnsured = false;
      });
    } catch (e) {
      console.error("Song data index creation failed:", e);
    }
  }
  return db.collection<YoutubeSongDataDoc>("youtube_song_data");
}

// Client-side error reports (lib/errorReporting.ts → /api/analytics/error).
// Expire on the same 90-day clock as heartbeats: an error nobody looked at in
// three months describes a build that no longer exists.
const CLIENT_ERROR_TTL_SECONDS = 90 * 24 * 60 * 60;

export interface ClientErrorDoc {
  message: string;
  source: "window" | "promise" | "react";
  /** "" when the error happened outside a room page. */
  roomId: string;
  stack?: string;
  page?: string;
  userAgent?: string;
  country?: string;
  region?: string;
  city?: string;
  locale?: string;
  timestamp: Date;
}

let clientErrorIndexesEnsured = false;

export async function getClientErrorsCollection(): Promise<Collection<ClientErrorDoc>> {
  const client = await getMongoClient();
  const db = client.db(process.env.MONGODB_DB);
  if (!clientErrorIndexesEnsured) {
    clientErrorIndexesEnsured = true;
    Promise.all([
      // Serves the per-room error panel and the rooms-list error badge.
      db.collection("client_errors").createIndex({ roomId: 1, timestamp: -1 }),
      db.collection("client_errors").createIndex(
        { timestamp: 1 },
        { expireAfterSeconds: CLIENT_ERROR_TTL_SECONDS }
      ),
    ]).catch((e) => {
      console.error("Client error index creation failed:", e);
      clientErrorIndexesEnsured = false;
    });
  }
  return db.collection<ClientErrorDoc>("client_errors");
}

// One doc per alert already sent, so a paging condition that keeps tripping only
// wakes Anna once. Worthless after the day passes; a week is a short audit trail.
const OPS_ALERT_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface OpsAlertDoc {
  /** e.g. "quota:2026-08-07" (alert mutex — see below) or
   * "quota-out:2026-08-07" (the day's durable quota-spent marker). */
  _id: string;
  sentAt: Date;
}

let opsAlertIndexesEnsured = false;

export async function getOpsAlertsCollection(): Promise<Collection<OpsAlertDoc>> {
  const client = await getMongoClient();
  const db = client.db(process.env.MONGODB_DB);
  if (!opsAlertIndexesEnsured) {
    opsAlertIndexesEnsured = true;
    // Don't add a unique index on the alert key: the dedupe mutex rides on
    // `_id` because index creation here is fire-and-forget, so the first alert
    // of all time would race its own index, let duplicates in, and poison every
    // later createIndex with E11000 — dedupe inert, paging on every failed
    // search, until the TTL cleared them. `_id` needs no build.
    db.collection("ops_alerts")
      .createIndex({ sentAt: 1 }, { expireAfterSeconds: OPS_ALERT_TTL_SECONDS })
      .catch((e) => {
        console.error("Ops alert index creation failed:", e);
        opsAlertIndexesEnsured = false;
      });
  }
  return db.collection<OpsAlertDoc>("ops_alerts");
}

let feedbackIndexesEnsured = false;

// No TTL on purpose: every other collection expires, but a bug report is the
// one thing worth keeping indefinitely.
export async function getFeedbackCollection(): Promise<Collection<FeedbackEntry>> {
  const client = await getMongoClient();
  const db = client.db(process.env.MONGODB_DB);
  if (!feedbackIndexesEnsured) {
    feedbackIndexesEnsured = true;
    Promise.all([
      db.collection("feedback").createIndex({ createdAt: -1 }),
      // Serves the unhandled count and the panel's default newest-first view.
      db.collection("feedback").createIndex({ handled: 1, createdAt: -1 }),
    ]).catch((e) => {
      console.error("Feedback index creation failed:", e);
      feedbackIndexesEnsured = false;
    });
  }
  return db.collection<FeedbackEntry>("feedback");
}

// Heartbeats are high-volume noise once a session is over; every other event
// type stays forever because long-term funnel metrics read from them.
// Sessions expire on the same clock via lastSeen.
const ANALYTICS_TTL_SECONDS = 90 * 24 * 60 * 60;

let indexesEnsured = false;

// Best-effort, once per instance. createIndex is a no-op when the index
// already exists, so this only costs anything on a cold start.
function ensureAnalyticsIndexes(db: Db): void {
  if (indexesEnsured) return;
  indexesEnsured = true;
  try {
    Promise.all([
      db.collection("analytics_events").createIndex({ type: 1, timestamp: -1 }),
      db.collection("analytics_events").createIndex({ roomId: 1, type: 1 }),
      // The landing page's country roll-up groups every event by country; on a
      // collection this size that has to be an index scan, not a table scan.
      db.collection("analytics_events").createIndex({ country: 1 }),
      db.collection("analytics_sessions").createIndex({ sessionKey: 1 }),
      db.collection("analytics_sessions").createIndex({ roomId: 1, role: 1 }),
      db.collection("analytics_events").createIndex(
        { timestamp: 1 },
        {
          expireAfterSeconds: ANALYTICS_TTL_SECONDS,
          partialFilterExpression: { type: "session_heartbeat" },
        }
      ),
      db.collection("analytics_sessions").createIndex(
        { lastSeen: 1 },
        { expireAfterSeconds: ANALYTICS_TTL_SECONDS }
      ),
    ]).catch((e) => {
      console.error("Analytics index creation failed:", e);
      indexesEnsured = false;
    });
  } catch (e) {
    console.error("Analytics index creation failed:", e);
  }
}

export async function getAnalyticsDb(): Promise<Db> {
  const client = await getMongoClient();
  const db = client.db(process.env.MONGODB_DB);
  ensureAnalyticsIndexes(db);
  return db;
}
