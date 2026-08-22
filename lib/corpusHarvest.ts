import type { Collection } from "mongodb";

import {
  getCronStateCollection,
  getHarvestCursorsCollection,
  getKaraokeSongsCollection,
  type CronStateDoc,
} from "./mongodb";
import {
  harvestKaraokeChannels,
  harvestTargets,
  karaokeChannelHandles,
  type ChannelBatch,
  type HarvestCursor,
} from "./karaokeChannels";
import type { SearchResult } from "./searchCache";
import { MAX_CUTS, recordHarvestMatches } from "./songCorpus";
import { matchHarvestToCatalog, type MatchedVideo } from "./suggestionMatch";
import { suggestionCatalog, type CatalogEntry } from "./suggestionCatalog";
import { fetchVideoRows, ID_BATCH } from "./youtubeVideos";

// The step that still works on a day the search quota is spent: channel uploads
// cost 1 unit per 50 out of a separate 10,000/day pool, and the strict matcher
// (lib/suggestionMatch) is what makes a title enough to file a video by.

/** Per-channel slice of the run's page budget, so one enormous channel can't
 *  starve the other thirty-four. The budget itself is CHANNEL_PAGES_PER_DAY. */
export const CHANNEL_PAGES_PER_CHANNEL = 60;

/** One channel's contribution to one song. Four channels covering a song is
 *  four arrangements; one channel filling all twelve cuts is a monoculture. */
export const CUTS_PER_SONG = 8;

export const CHANNEL_RESWEEP_MS = 14 * 24 * 60 * 60 * 1000;

const CURSOR_PREFIX = "harvest:";

/** "<playlistId>|<pageToken>" — neither half can hold a pipe, and one cursor
 *  field keeps every step's state doc the same shape. */
function encodeCursor(cursor: HarvestCursor): string {
  return `${cursor.playlistId ?? ""}|${cursor.pageToken ?? ""}`;
}

function decodeCursor(doc: CronStateDoc): HarvestCursor {
  const [playlistId, pageToken] = (doc.cursor ?? "").split("|");
  return {
    playlistId: playlistId || undefined,
    pageToken: pageToken || undefined,
    // A finished channel is parked with done:true, so its write time is when it
    // finished — which is what the resweep window is measured from.
    completedAt: doc.done ? doc.updatedAt : undefined,
  };
}

async function loadCursors(targets: string[]): Promise<Map<string, HarvestCursor>> {
  const state = await getCronStateCollection();
  const docs = await state
    .find({ _id: { $in: targets.map((t) => CURSOR_PREFIX + t) } })
    .toArray();
  const cursors = new Map<string, HarvestCursor>();
  for (const doc of docs) {
    cursors.set(doc._id.slice(CURSOR_PREFIX.length), decodeCursor(doc));
  }

  // One-time bridge from the pre-corpus store, dropped in phase 3: a channel
  // restarting from its newest upload re-walks weeks of nightly budget.
  const missing = targets.filter((t) => !cursors.has(t));
  if (missing.length > 0) {
    const legacy = await getHarvestCursorsCollection();
    const rows = await legacy.find({ _id: { $in: missing } }).toArray();
    for (const row of rows) {
      cursors.set(row._id, {
        playlistId: row.playlistId,
        pageToken: row.pageToken,
        completedAt: row.completedAt,
      });
    }
  }
  return cursors;
}

async function saveCursor(
  state: Collection<CronStateDoc>,
  target: string,
  cursor: HarvestCursor
): Promise<void> {
  const now = cursor.completedAt ?? new Date();
  const set: Record<string, unknown> = { cursor: encodeCursor(cursor), updatedAt: now };
  const unset: Record<string, ""> = {};
  if (cursor.completedAt) {
    // No cursorAt on a finished channel: that field is the TTL clock, and a
    // channel parked for its two-week resweep must outlive a seven-day sweep.
    set.done = true;
    unset.cursorAt = "";
  } else {
    set.cursorAt = now;
    unset.done = "";
  }
  await state.updateOne(
    { _id: CURSOR_PREFIX + target },
    { $set: set, $unset: unset },
    { upsert: true }
  );
}

/** Every catalog song but the ones already at the cut cap — enrichment bought
 *  for a song that can't take another cut is a unit spent on nothing. */
async function wantedEntries(): Promise<CatalogEntry[]> {
  const songs = await getKaraokeSongsCollection();
  const full = await songs
    .find(
      { $expr: { $gte: [{ $size: "$cuts" }, MAX_CUTS] } },
      { projection: { _id: 1 } }
    )
    .toArray();
  const done = new Set(full.map((d) => d._id));
  return Array.from(suggestionCatalog().values()).filter((e) => !done.has(e.key));
}

/** Durations and view counts aren't in a playlist row, so matched uploads get
 *  one videos.list pass for the same badges a searched row carries. Best-effort:
 *  recordHarvestMatches keeps the playlist's title where a lookup didn't reach. */
async function enrichMatches(
  matches: Map<string, MatchedVideo[]>,
  key: string,
  deadline: number
): Promise<{ details: Map<string, SearchResult>; units: number }> {
  const ids: string[] = [];
  const seen = new Set<string>();
  matches.forEach((rows) => {
    for (const row of rows) {
      if (seen.has(row.videoId)) continue;
      seen.add(row.videoId);
      ids.push(row.videoId);
    }
  });

  const details = new Map<string, SearchResult>();
  let units = 0;
  for (let i = 0; i < ids.length && Date.now() < deadline; i += ID_BATCH) {
    units += 1;
    const rows = await fetchVideoRows(ids.slice(i, i + ID_BATCH), key);
    rows?.forEach((row, id) => details.set(id, row));
  }
  return { details, units };
}

export interface HarvestStepReport {
  channels: string[];
  missing: string[];
  units: number;
  pages: number;
  stoppedEarly: boolean;
  /** Catalog songs still short of the cap when the run started. */
  wanted: number;
  videosUpserted: number;
  videosRefreshed: number;
  songsFilled: number;
}

export interface HarvestStepOptions {
  totalPages: number;
  pagesPerChannel: number;
  resweepAfterMs: number;
  maxCutsPerSong: number;
}

export async function harvestIntoCorpus(
  deadline: number,
  opts: HarvestStepOptions
): Promise<{ done: boolean; report: HarvestStepReport }> {
  const report: HarvestStepReport = {
    channels: [],
    missing: [],
    units: 0,
    pages: 0,
    stoppedEarly: false,
    wanted: 0,
    videosUpserted: 0,
    videosRefreshed: 0,
    songsFilled: 0,
  };
  const key = process.env.YOUTUBE_API_KEY;
  if (!key || Date.now() >= deadline) return { done: false, report };

  const wanted = await wantedEntries();
  report.wanted = wanted.length;
  if (wanted.length === 0) return { done: true, report };

  const state = await getCronStateCollection();
  const handles = karaokeChannelHandles();
  const cursors = await loadCursors(harvestTargets(handles));
  let extraUnits = 0;

  const onChannel = async ({ channel, videos, cursor }: ChannelBatch) => {
    // Persisted per channel, not buffered: a sweep runs for minutes, and
    // buffering meant a run killed at the function cap stored nothing.
    await saveCursor(state, channel, cursor);
    if (videos.length === 0) return;

    const matches = matchHarvestToCatalog(videos, wanted, opts.maxCutsPerSong);
    if (matches.size === 0) return;

    const enriched = await enrichMatches(matches, key, deadline);
    extraUnits += enriched.units;
    const written = await recordHarvestMatches(matches, enriched.details);
    report.videosUpserted += written.videosUpserted;
    report.videosRefreshed += written.videosRefreshed;
    report.songsFilled += written.songsFilled;
  };

  const harvest = await harvestKaraokeChannels(handles, {
    totalPages: opts.totalPages,
    pagesPerChannel: opts.pagesPerChannel,
    deadlineMs: deadline,
    resweepAfterMs: opts.resweepAfterMs,
    cursors,
    onChannel,
  });

  report.channels = harvest.channels;
  report.missing = harvest.missing;
  report.units = harvest.units + extraUnits;
  report.pages = harvest.pages;
  report.stoppedEarly = harvest.stoppedEarly;
  return { done: !harvest.stoppedEarly, report };
}
