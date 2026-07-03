// Rooms created before the 30-day TTL shipped (commit 0eec1fb) have no
// lastActivity field, so the TTL index never expires them. Stamp them with
// the current time so they start their 30-day clock now.
//
// Run manually:  node scripts/backfill-last-activity.mjs
// Reads MONGODB_URI and MONGODB_DB from .env.local.

import { readFileSync } from "node:fs";
import { MongoClient } from "mongodb";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

if (!process.env.MONGODB_URI) {
  console.error("MONGODB_URI not set (checked env and .env.local)");
  process.exit(1);
}

const client = new MongoClient(process.env.MONGODB_URI);
try {
  await client.connect();
  const rooms = client.db(process.env.MONGODB_DB).collection("rooms");
  const result = await rooms.updateMany(
    { lastActivity: { $exists: false } },
    { $set: { lastActivity: new Date() } }
  );
  console.log(`Backfilled lastActivity on ${result.modifiedCount} room(s).`);
} finally {
  await client.close();
}
