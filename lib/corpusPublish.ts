import type { AnyBulkWriteOperation } from "mongodb";

import {
  getCronStateCollection,
  getKaraokeSongsCollection,
  getKaraokeVideosCollection,
  getSuggestionVideosCollection,
  type KaraokeSongDoc,
  type KaraokeVideoDoc,
  type SuggestionVideoDoc,
} from "./mongodb";
import type { SearchResult } from "./searchCache";
import { catalogEntry } from "./suggestionCatalog";
import { THIN_RESULTS } from "./suggestionVideos";

// Two jobs, no YouTube units. A karaoke_videos row deletes itself on its TTL
// and tells nobody, so a song whose cuts have all expired still looks resolved
// to every other step — full to the harvest, cut-holding to the resolver.
//
// And suggestion_videos is still what a tap reads (pages/api/search.ts) with
// nothing else left writing it, so its 30-day TTL would empty it song by song.
// That half goes away with the collection when the corpus serving path lands.

const CURSOR_ID = "publish";

/** A full pass over the ~900-song corpus; the cursor covers the rest. */
export const PUBLISH_PER_RUN = 1000;

const PAGE = 200;

export interface PublishReport {
  scanned: number;
  /** Cuts whose video row had expired, pulled off the song. */
  reconciled: number;
  /** Songs left holding nothing, and so back on the resolver's queue. */
  emptied: number;
  published: number;
  /** Too few live cuts to serve. Deliberately neither refreshed nor deleted:
   *  the entry is no worse than yesterday's, and deleting it sends the tap to a
   *  live search over a couple of cuts. */
  thin: number;
}

function hydrate(row: KaraokeVideoDoc): SearchResult {
  return {
    videoId: row._id,
    title: row.title,
    thumbnailUrl: row.thumbnailUrl,
    ...(row.durationSeconds !== undefined
      ? { durationSeconds: row.durationSeconds }
      : {}),
    ...(row.viewCount !== undefined ? { viewCount: row.viewCount } : {}),
  };
}

/** Paged by _id so a killed run resumes, and starting over once it runs out —
 *  a refresh loop, not a migration. */
export async function publishCorpus(
  deadline: number
): Promise<{ done: boolean; report: PublishReport }> {
  const report: PublishReport = {
    scanned: 0,
    reconciled: 0,
    emptied: 0,
    published: 0,
    thin: 0,
  };
  if (Date.now() >= deadline) return { done: false, report };

  const state = await getCronStateCollection();
  const songs = await getKaraokeSongsCollection();
  const videos = await getKaraokeVideosCollection();
  const store = await getSuggestionVideosCollection();

  let cursor = (await state.findOne({ _id: CURSOR_ID }))?.cursor ?? "";
  let done = false;

  while (report.scanned < PUBLISH_PER_RUN && Date.now() < deadline) {
    const page = await songs
      .find({ cuts: { $ne: [] }, ...(cursor ? { _id: { $gt: cursor } } : {}) })
      .sort({ _id: 1 })
      .limit(Math.min(PAGE, PUBLISH_PER_RUN - report.scanned))
      .toArray();
    if (page.length === 0) {
      done = true;
      break;
    }
    report.scanned += page.length;
    cursor = page[page.length - 1]._id;

    const ids = Array.from(new Set(page.flatMap((song) => song.cuts ?? [])));
    const live = new Map(
      (await videos.find({ _id: { $in: ids } }).toArray()).map((row) => [row._id, row])
    );

    const songOps: AnyBulkWriteOperation<KaraokeSongDoc>[] = [];
    const storeOps: AnyBulkWriteOperation<SuggestionVideoDoc>[] = [];
    const now = new Date();

    for (const song of page) {
      const held = song.cuts ?? [];
      const cuts = held.filter((id) => live.has(id));
      const top =
        song.topVideoId && cuts.indexOf(song.topVideoId) >= 0
          ? song.topVideoId
          : undefined;

      const dead = held.filter((id) => !live.has(id));
      if (dead.length > 0) {
        report.reconciled += dead.length;
        if (cuts.length === 0) report.emptied += 1;
        songOps.push({
          updateOne: {
            filter: { _id: song._id },
            update: {
              // $pull, never the list back: a room's add lands inside this
              // read, and rewriting cuts wholesale would silently revert it.
              $pull: { cuts: { $in: dead } },
              // Left dangling, the badge pins a video the song no longer serves.
              ...(song.topVideoId && !top ? { $unset: { topVideoId: "" } } : {}),
            },
          },
        });
      }

      // pages/api/search.ts only reads the store for a catalog key.
      if (!catalogEntry(song._id)) continue;
      if (cuts.length < THIN_RESULTS) {
        report.thin += 1;
        continue;
      }
      report.published += 1;
      storeOps.push({
        updateOne: {
          filter: { _id: song._id },
          update: {
            $set: {
              results: cuts.map((id) => hydrate(live.get(id)!)),
              refreshedAt: now,
              ...(top ? { topVideoId: top } : {}),
            },
            // Only on insert: it dates a search.list call, and this spends none.
            $setOnInsert: { resolvedAt: now },
            ...(top ? {} : { $unset: { topVideoId: "" } }),
          },
          upsert: true,
        },
      });
    }

    // Songs before the store: the other order leaves the store serving a cut
    // the song has dropped, where this one costs a tap a stale night.
    if (songOps.length > 0) {
      try {
        await songs.bulkWrite(songOps, { ordered: false });
      } catch (e: any) {
        console.warn("Publish song write partly failed:", e?.message);
      }
    }
    if (storeOps.length > 0) {
      try {
        await store.bulkWrite(storeOps, { ordered: false });
      } catch (e: any) {
        console.warn("Publish store write partly failed:", e?.message);
      }
    }
  }

  const now = new Date();
  // cursorAt is the TTL clock; losing this doc costs a pass, not correctness.
  await state.updateOne(
    { _id: CURSOR_ID },
    { $set: { cursor: done ? "" : cursor, cursorAt: now, updatedAt: now } },
    { upsert: true }
  );
  return { done, report };
}
