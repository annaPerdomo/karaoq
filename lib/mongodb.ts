import { MongoClient, type Db } from "mongodb";

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
