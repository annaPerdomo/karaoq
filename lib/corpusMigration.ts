import type { AnyBulkWriteOperation, Collection } from "mongodb";

import { pinTopFirst, type ResolvedResult } from "./corpusRead";
import {
  getCronStateCollection,
  getKaraokeSongsCollection,
  getKaraokeVideosCollection,
  getSuggestionVideosCollection,
  type CronStateDoc,
  type KaraokeSongDoc,
  type KaraokeVideoDoc,
  type SuggestionVideoDoc,
} from "./mongodb";
import { MAX_CUTS, songIdentityFromCatalog } from "./songCorpus";
import { catalogEntry, suggestionCatalog, type CatalogEntry } from "./suggestionCatalog";
import { suggestionDemand } from "./suggestionDemand";

// Only ever runs as an authenticated cron step: dev and prod share one database,
// so an import-time or per-request trigger would rewrite live data from a laptop.
// suggestion_videos stays read-only here — it's the rollback until dropped.

/** Bumping the suffix is how a re-seed is authorised — the old id stays done. */
export const MIGRATION_ID = "migrate-v1";

/** Small enough that a killed run loses little, large enough that the cursor
 *  write isn't the cost of the run. */
const BATCH = 100;

type Phase = "catalog" | "store" | "demand";

// Catalog before demand: seedDemand only updates existing docs, so a demand
// reached before its song's identity exists is silently dropped to zero.
const PHASES: Phase[] = ["catalog", "store", "demand"];

export interface MigrationReport {
  /** The step already finished for good; nothing was read or written. */
  skipped?: boolean;
  /** Where the next run resumes, or "done". */
  phase: Phase | "done";
  songsSeeded: number;
  videosSeeded: number;
  songsFilled: number;
  demandScored: number;
  /** Store entries whose song has since left the catalog — a doc with no
   *  title, so it is counted rather than migrated. */
  orphaned: number;
}

function emptyReport(phase: Phase | "done"): MigrationReport {
  return {
    phase,
    songsSeeded: 0,
    videosSeeded: 0,
    songsFilled: 0,
    demandScored: 0,
    orphaned: 0,
  };
}

/** Keys hold only lowercase alphanumerics and spaces (searchCacheKey), so the
 *  first colon always separates the phase from where it stopped. */
function parseCursor(raw?: string): { phase: Phase; cursor: string } {
  const at = raw ? raw.indexOf(":") : -1;
  const phase = at >= 0 ? (raw!.slice(0, at) as Phase) : ("" as Phase);
  return PHASES.indexOf(phase) >= 0
    ? { phase, cursor: raw!.slice(at + 1) }
    : { phase: PHASES[0], cursor: "" };
}

async function saveCursor(
  state: Collection<CronStateDoc>,
  phase: Phase,
  cursor: string
): Promise<void> {
  const now = new Date();
  await state.updateOne(
    { _id: MIGRATION_ID },
    { $set: { cursor: `${phase}:${cursor}`, cursorAt: now, updatedAt: now } },
    { upsert: true }
  );
}

/** Sorted so a cursor means the same thing on every run. */
function catalogKeys(): string[] {
  return Array.from(suggestionCatalog().keys()).sort();
}

function after(keys: string[], cursor: string): string[] {
  if (!cursor) return keys.slice(0, BATCH);
  const start = keys.findIndex((k) => k > cursor);
  return start < 0 ? [] : keys.slice(start, start + BATCH);
}

/** $setOnInsert throughout — an add's own write always wins a race against
 *  this seed, never the reverse. */
async function seedCatalog(
  cursor: string,
  report: MigrationReport
): Promise<string | null> {
  const batch = after(catalogKeys(), cursor);
  if (batch.length === 0) return null;

  const songs = await getKaraokeSongsCollection();
  const ops: AnyBulkWriteOperation<KaraokeSongDoc>[] = batch.map((key) => {
    const { _id, ...identity } = songIdentityFromCatalog(catalogEntry(key)!);
    return {
      updateOne: {
        filter: { _id },
        update: {
          $setOnInsert: {
            ...identity,
            // Empty cuts IS the wanted list — the resolver's queue.
            cuts: [],
            addCount: 0,
            addsByCountry: {},
            demand: 0,
          },
        },
        upsert: true,
      },
    };
  });
  try {
    const written = await songs.bulkWrite(ops, { ordered: false });
    report.songsSeeded += written.upsertedCount;
  } catch (e: any) {
    // Unordered: a duplicate-key error means an add's own upsert won this
    // race, and that doc already exists — one bad row must not stall the batch.
    console.warn("Migration catalog write partly failed:", e?.message);
  }
  return batch[batch.length - 1];
}

function growCuts(
  doc: SuggestionVideoDoc,
  existing: string[]
): { cuts: string[]; rows: ResolvedResult[] } {
  const cuts = existing.slice();
  const rows: ResolvedResult[] = [];
  // Only rows that become cuts are stored, so the harvest sweep's nightly
  // budget isn't spent re-checking rows no song serves. Pinned first, so the
  // cap can't drop the community's pick.
  for (const row of pinTopFirst(doc.results, doc.topVideoId)) {
    if (cuts.length >= MAX_CUTS) break;
    if (cuts.indexOf(row.videoId) >= 0) continue;
    cuts.push(row.videoId);
    rows.push(row);
  }
  return { cuts, rows };
}

/** Already resolved, so seeding from suggestion_videos spends no search quota. */
async function seedStore(
  cursor: string,
  report: MigrationReport
): Promise<string | null> {
  const store = await getSuggestionVideosCollection();
  const docs = await store
    .find(cursor ? { _id: { $gt: cursor } } : {})
    .sort({ _id: 1 })
    .limit(BATCH)
    .toArray();
  if (docs.length === 0) return null;

  const songs = await getKaraokeSongsCollection();
  const videos = await getKaraokeVideosCollection();

  // Sized off a point-in-time read: worst case a room's add lands here and a
  // video row that never makes the cut is upserted a batch early. Harmless —
  // only the song write below could be corrupted, so only that read is repeated.
  const early = new Map(
    (
      await songs.find({ _id: { $in: docs.map((d) => d._id) } }).toArray()
    ).map((s) => [s._id, s])
  );

  // One op per video even where two songs share a cut — two upserts on one new
  // _id within an unordered batch can both attempt the insert and one throws.
  const pending = new Map<
    string,
    { onInsert: Record<string, unknown>; songKeys: string[] }
  >();
  const wanted: { doc: SuggestionVideoDoc; entry: CatalogEntry }[] = [];

  for (const doc of docs) {
    const entry = catalogEntry(doc._id);
    if (!entry) {
      report.orphaned += 1;
      continue;
    }
    wanted.push({ doc, entry });

    const { rows } = growCuts(doc, early.get(doc._id)?.cuts ?? []);
    for (const row of rows) {
      const seen = pending.get(row.videoId);
      if (seen) {
        if (seen.songKeys.indexOf(doc._id) < 0) seen.songKeys.push(doc._id);
        continue;
      }
      pending.set(row.videoId, {
        // $setOnInsert: a store row's date is older than a video's own
        // provenance, and $set-ing it would push a live retention clock back.
        onInsert: {
          title: row.title,
          thumbnailUrl: row.thumbnailUrl,
          ...(row.durationSeconds !== undefined
            ? { durationSeconds: row.durationSeconds }
            : {}),
          ...(row.viewCount !== undefined ? { viewCount: row.viewCount } : {}),
          firstSeenAt: doc.resolvedAt ?? doc.refreshedAt,
          refreshedAt: doc.refreshedAt,
        },
        songKeys: [doc._id],
      });
    }
  }

  const videoOps: AnyBulkWriteOperation<KaraokeVideoDoc>[] = [];
  pending.forEach((row, videoId) => {
    videoOps.push({
      updateOne: {
        filter: { _id: videoId },
        update: {
          $set: { "sources.seed": true },
          $addToSet: { songKeys: { $each: row.songKeys } },
          $setOnInsert: row.onInsert,
        },
        upsert: true,
      },
    });
  });

  // Videos before songs: a cut whose video row is missing serves nothing, so a
  // run killed between the two writes is better off owing cuts than ids.
  if (videoOps.length > 0) {
    try {
      const written = await videos.bulkWrite(videoOps, { ordered: false });
      report.videosSeeded += written.upsertedCount;
    } catch (e: any) {
      console.warn("Migration store video write partly failed:", e?.message);
    }
  }

  if (wanted.length === 0) return docs[docs.length - 1]._id;

  // Re-read right before writing: the video bulkWrite above is a round trip a
  // room's add can land inside, and writing cuts off the early read would
  // silently revert it. fileCut (songCorpus.ts) is the only other writer here.
  const fresh = new Map(
    (
      await songs
        .find({ _id: { $in: wanted.map((w) => w.doc._id) } })
        .toArray()
    ).map((s) => [s._id, s])
  );

  const songOps: AnyBulkWriteOperation<KaraokeSongDoc>[] = [];
  for (const { doc, entry } of wanted) {
    const song = fresh.get(doc._id);
    const before = song?.cuts ?? [];
    const { cuts } = growCuts(doc, before);
    if (cuts.length !== before.length) report.songsFilled += 1;

    const { _id, ...identity } = songIdentityFromCatalog(entry);
    const top =
      song?.topVideoId ??
      (doc.topVideoId && cuts.indexOf(doc.topVideoId) >= 0
        ? doc.topVideoId
        : undefined);
    songOps.push({
      updateOne: {
        filter: { _id },
        update: {
          $set: { cuts, ...(top ? { topVideoId: top } : {}) },
          $setOnInsert: {
            ...identity,
            addCount: 0,
            addsByCountry: {},
            demand: 0,
          },
        },
        upsert: true,
      },
    });
  }
  if (songOps.length > 0) {
    try {
      await songs.bulkWrite(songOps, { ordered: false });
    } catch (e: any) {
      console.warn("Migration store song write partly failed:", e?.message);
    }
  }

  return docs[docs.length - 1]._id;
}

/** What people tapped, denormalized onto the song so the resolver can order
 *  its nightly searches without re-querying analytics events. */
async function seedDemand(
  demand: Map<string, number>,
  cursor: string,
  report: MigrationReport
): Promise<string | null> {
  const batch = after(Array.from(demand.keys()).sort(), cursor);
  if (batch.length === 0) return null;

  const songs = await getKaraokeSongsCollection();
  try {
    // No upsert: every key here came from the current catalog, so its doc was
    // written by the first step or the song has since been retired.
    await songs.bulkWrite(
      batch.map((key) => ({
        updateOne: {
          filter: { _id: key },
          update: { $set: { demand: demand.get(key)! } },
        },
      })),
      { ordered: false }
    );
    report.demandScored += batch.length;
  } catch (e: any) {
    console.warn("Migration demand write partly failed:", e?.message);
  }
  return batch[batch.length - 1];
}

/** Resumable seed, safe to run every night forever: an O(1) read once finished,
 *  and every write idempotent, so a run killed at the 300s cap continues from
 *  its cursor. */
export async function migrateToCorpus(
  deadline: number
): Promise<{ done: boolean; report: MigrationReport }> {
  const state = await getCronStateCollection();
  const saved = await state.findOne({ _id: MIGRATION_ID });
  if (saved?.done) {
    return { done: true, report: { ...emptyReport("done"), skipped: true } };
  }

  let { phase, cursor } = parseCursor(saved?.cursor);
  const report = emptyReport(phase);
  let demand: Map<string, number> | null = null;

  while (Date.now() < deadline) {
    if (phase === "demand" && !demand) demand = await suggestionDemand();
    const next =
      phase === "catalog"
        ? await seedCatalog(cursor, report)
        : phase === "store"
        ? await seedStore(cursor, report)
        : await seedDemand(demand!, cursor, report);

    if (next !== null) {
      // After every batch, not at the end: a run killed at the function cap
      // never reaches its own cleanup.
      cursor = next;
      await saveCursor(state, phase, cursor);
      continue;
    }

    const nextPhase = PHASES[PHASES.indexOf(phase) + 1];
    if (!nextPhase) {
      const now = new Date();
      // cursorAt goes with the cursor: a done doc with a TTL clock deletes
      // itself in a week, and a missing doc reads as "never ran" — which would
      // re-seed a corpus that live traffic has since moved on from.
      await state.updateOne(
        { _id: MIGRATION_ID },
        {
          $set: { done: true, updatedAt: now },
          $unset: { cursor: "", cursorAt: "" },
        },
        { upsert: true }
      );
      report.phase = "done";
      return { done: true, report };
    }
    phase = nextPhase;
    cursor = "";
    await saveCursor(state, phase, cursor);
  }

  report.phase = phase;
  await saveCursor(state, phase, cursor);
  return { done: false, report };
}
