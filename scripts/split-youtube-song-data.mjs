// One-time migration for the YouTube 30-day retention split.
//
// Events written before the split carry songTitle/songArtist/videoId on the
// analytics_events doc itself, which is kept forever — exactly what YouTube's
// Developer Policies (III.E.4) forbid past 30 days. This moves the ones still
// inside the window into youtube_song_data (where a TTL index expires them)
// and strips the fields off every event, old or new.
//
// Run manually:  node scripts/split-youtube-song-data.mjs
//                node scripts/split-youtube-song-data.mjs --dry-run
// Reads MONGODB_URI and MONGODB_DB from .env.local.
//
// Idempotent: re-running finds nothing left to move. Irreversible: song titles
// on events older than 30 days are deleted, not archived. That is the point.

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
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

const DRY_RUN = process.argv.includes("--dry-run");

// Kept in sync with lib/youtubeRetention.ts — a plain .mjs script can't import
// the TypeScript module.
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const YOUTUBE_DERIVED_EVENTS = [
  "song_added",
  "song_suggested",
  "suggestion_claimed",
  "singwithme_posted",
  "singwithme_joined",
  "singwithme_queued",
];
const YOUTUBE_FIELDS = { songTitle: "", songArtist: "", videoId: "" };
const HAS_YOUTUBE_FIELD = {
  $or: [
    { songTitle: { $exists: true } },
    { songArtist: { $exists: true } },
    { videoId: { $exists: true } },
  ],
};

const CARRIES_YOUTUBE_DATA = {
  $or: [
    { type: { $in: YOUTUBE_DERIVED_EVENTS } },
    { type: "suggestion_used", suggestionSource: "trending" },
  ],
};

const client = new MongoClient(process.env.MONGODB_URI);
try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB);
  const events = db.collection("analytics_events");
  const songData = db.collection("youtube_song_data");
  const cutoff = new Date(Date.now() - MAX_AGE_MS);

  const scope = { ...CARRIES_YOUTUBE_DATA, ...HAS_YOUTUBE_FIELD };
  const total = await events.countDocuments(scope);
  const inWindow = await events.countDocuments({ ...scope, timestamp: { $gte: cutoff } });
  console.log(
    `${total} event(s) still carry YouTube data; ${inWindow} are inside the 30-day window ` +
      `and will be moved, ${total - inWindow} are older and will only be stripped.`
  );

  if (DRY_RUN) {
    console.log("Dry run — nothing written.");
    process.exit(0);
  }

  // Move the in-window ones first. If the run dies halfway, the worst case is
  // that some titles were copied but not yet stripped, and a re-run finishes
  // the job; the reverse order would lose them.
  let moved = 0;
  const cursor = events.find({ ...scope, timestamp: { $gte: cutoff } });
  for await (const event of cursor) {
    const dataId = randomUUID();
    const doc = {
      dataId,
      roomId: event.roomId,
      type: event.type,
      timestamp: event.timestamp,
    };
    if (event.country) doc.country = event.country;
    if (event.songTitle) doc.songTitle = event.songTitle;
    if (event.songArtist) doc.songArtist = event.songArtist;
    if (event.videoId) doc.videoId = event.videoId;

    await songData.insertOne(doc);
    await events.updateOne(
      { _id: event._id },
      { $set: { songDataId: dataId }, $unset: YOUTUBE_FIELDS }
    );
    moved += 1;
    if (moved % 500 === 0) console.log(`  moved ${moved}/${inWindow}…`);
  }
  console.log(`Moved ${moved} event(s) into youtube_song_data.`);

  // Everything left is past the window: strip, don't archive.
  const stripped = await events.updateMany(scope, { $unset: YOUTUBE_FIELDS });
  console.log(`Stripped YouTube fields from ${stripped.modifiedCount} older event(s).`);

  const remaining = await events.countDocuments(scope);
  console.log(
    remaining === 0
      ? "Done — no analytics event carries YouTube data any more."
      : `WARNING: ${remaining} event(s) still carry YouTube data; re-run this script.`
  );
} finally {
  await client.close();
}
