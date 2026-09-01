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
import { pruneCachedVideos } from "./searchCache";
import { dropVideos, MAX_CUTS, recordHarvestMatches } from "./songCorpus";
import { matchHarvestToCatalog, type MatchedVideo } from "./suggestionMatch";
import { suggestionCatalog, type CatalogEntry } from "./suggestionCatalog";
import { blockVideos, filterBlockedIds } from "./videoBlocklist";
import { fetchVideoRows, ID_BATCH } from "./youtubeVideos";

/** Slice of CHANNEL_PAGES_PER_DAY, so one channel can't starve the rest. */
export const CHANNEL_PAGES_PER_CHANNEL = 60;

/** One channel's share of a song; twelve cuts from one is a monoculture. */
export const CUTS_PER_SONG = 8;

export const CHANNEL_RESWEEP_MS = 14 * 24 * 60 * 60 * 1000;

const CURSOR_PREFIX = "harvest:";

/** "<playlistId>|<pageToken>" — neither half can hold a pipe. */
function encodeCursor(cursor: HarvestCursor): string {
  return `${cursor.playlistId ?? ""}|${cursor.pageToken ?? ""}`;
}

function decodeCursor(doc: CronStateDoc): HarvestCursor {
  const [playlistId, pageToken] = (doc.cursor ?? "").split("|");
  return {
    playlistId: playlistId || undefined,
    pageToken: pageToken || undefined,
    // A finished channel is parked with done:true, so updatedAt is when it did.
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

  // Bridge from the pre-corpus store: a restart re-walks weeks of budget.
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
    // two-week resweep must outlive a seven-day sweep.
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

/** Every catalog song short of the cut cap. Counts ids, so a song holding cuts
 *  the sweep hasn't named yet reads as full and sits out one run. */
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

function matchedVideoIds(matches: Map<string, MatchedVideo[]>): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  matches.forEach((rows) => {
    for (const row of rows) {
      if (seen.has(row.videoId)) continue;
      seen.add(row.videoId);
      ids.push(row.videoId);
    }
  });
  return ids;
}

function withoutVideos(
  matches: Map<string, MatchedVideo[]>,
  drop: Set<string>
): Map<string, MatchedVideo[]> {
  if (drop.size === 0) return matches;
  const kept = new Map<string, MatchedVideo[]>();
  matches.forEach((rows, songKey) => {
    const live = rows.filter((row) => !drop.has(row.videoId));
    if (live.length > 0) kept.set(songKey, live);
  });
  return kept;
}

function keepVideos(
  matches: Map<string, MatchedVideo[]>,
  keep: Set<string>
): Map<string, MatchedVideo[]> {
  const kept = new Map<string, MatchedVideo[]>();
  matches.forEach((rows, songKey) => {
    const live = rows.filter((row) => keep.has(row.videoId));
    if (live.length > 0) kept.set(songKey, live);
  });
  return kept;
}

/** Durations, view counts and embeddability aren't in a playlist row. An id in
 *  neither map was never asked about — the deadline, or fetchVideoRows on null. */
async function enrichMatches(
  matches: Map<string, MatchedVideo[]>,
  key: string,
  deadline: number
): Promise<{
  details: Map<string, SearchResult>;
  unembeddable: string[];
  units: number;
}> {
  const ids = matchedVideoIds(matches);

  const details = new Map<string, SearchResult>();
  const unembeddable: string[] = [];
  let units = 0;
  for (let i = 0; i < ids.length && Date.now() < deadline; i += ID_BATCH) {
    units += 1;
    const fetched = await fetchVideoRows(ids.slice(i, i + ID_BATCH), key);
    fetched?.rows.forEach((row, id) => details.set(id, row));
    for (const id of fetched?.unembeddable ?? []) unembeddable.push(id);
  }
  return { details, unembeddable, units };
}

export interface HarvestStepReport {
  channels: string[];
  missing: string[];
  units: number;
  pages: number;
  stoppedEarly: boolean;
  wanted: number;
  videosUpserted: number;
  videosRefreshed: number;
  videosBlocked: number;
  songsFilled: number;
}

export interface HarvestStepOptions {
  totalPages: number;
  pagesPerChannel: number;
  resweepAfterMs: number;
  maxCutsPerSong: number;
  /** Billed per page as bought: a step that throws has still spent them. */
  onPages?: (pages: number) => void;
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
    videosBlocked: 0,
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
  // Narrowed as songs fill: a match on a full song buys enrichment for nothing.
  let open = wanted;

  const onChannel = async ({ channel, videos, cursor }: ChannelBatch) => {
    // Per channel, not buffered: a run killed at the function cap stored nothing.
    await saveCursor(state, channel, cursor);
    if (videos.length === 0 || open.length === 0) return;

    let matches = matchHarvestToCatalog(videos, open, opts.maxCutsPerSong);
    if (matches.size === 0) return;

    // Before the lookup: re-reading a tombstoned upload spends a unit for nothing.
    const blocked = await filterBlockedIds(matchedVideoIds(matches));
    matches = withoutVideos(matches, blocked);
    if (matches.size === 0) return;

    const enriched = await enrichMatches(matches, key, deadline);
    extraUnits += enriched.units;
    // An earlier run may have filed the upload as a cut, and a tombstone alone
    // leaves that cut servable until a sweep reaches the row 16+ days later.
    if (enriched.unembeddable.length > 0) {
      report.videosBlocked += await blockVideos(enriched.unembeddable, "unembeddable");
      await dropVideos(enriched.unembeddable);
      await pruneCachedVideos(enriched.unembeddable);
    }
    // Only what the lookup vouched for: recordHarvestMatches falls back to the
    // playlist title and picture, so anything else files as a servable cut.
    matches = keepVideos(matches, new Set(enriched.details.keys()));
    if (matches.size === 0) return;

    const written = await recordHarvestMatches(matches, enriched.details);
    report.videosUpserted += written.videosUpserted;
    report.videosRefreshed += written.videosRefreshed;
    report.songsFilled += written.songsFilled;
    if (written.full.length > 0) {
      const filled = new Set(written.full);
      open = open.filter((entry) => !filled.has(entry.key));
    }
  };

  const harvest = await harvestKaraokeChannels(handles, {
    totalPages: opts.totalPages,
    pagesPerChannel: opts.pagesPerChannel,
    deadlineMs: deadline,
    resweepAfterMs: opts.resweepAfterMs,
    cursors,
    onChannel,
    ...(opts.onPages ? { onPages: opts.onPages } : {}),
  });

  report.channels = harvest.channels;
  report.missing = harvest.missing;
  report.units = harvest.units + extraUnits;
  report.pages = harvest.pages;
  report.stoppedEarly = harvest.stoppedEarly;
  return { done: !harvest.stoppedEarly, report };
}
