import { MongoClient, type Collection, type Db } from "mongodb";
import type { Room } from "../pages/api/types";

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

const SEARCH_CACHE_TTL_SECONDS = 24 * 60 * 60;

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
      db.collection("search_cache").createIndex(
        { createdAt: 1 },
        { expireAfterSeconds: SEARCH_CACHE_TTL_SECONDS }
      ),
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
