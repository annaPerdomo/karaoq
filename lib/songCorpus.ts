import type { AnyBulkWriteOperation, UpdateFilter } from "mongodb";

import {
  getKaraokeSongsCollection,
  getKaraokeVideosCollection,
  type KaraokeSongDoc,
  type KaraokeVideoDoc,
} from "./mongodb";
import type { SearchResult } from "./searchCache";
import {
  catalogEntry,
  catalogPackIds,
  type CatalogEntry,
} from "./suggestionCatalog";
import { isCutOf, type MatchedVideo } from "./suggestionMatch";

export const MAX_CUTS = 12;

/** Rooms are free to create, so one room's adds are a claim, not a consensus —
 *  never relax this to a raw add count. */
export const MIN_ADD_ROOMS = 2;

/** Own budget, not a share of MAX_CUTS: nothing serves an unnamed row, so a
 *  shared cap let one add evict a cut every tap could play. */
const PENDING_CUTS = MAX_CUTS;

function isServable(row?: { thumbnailUrl?: string }): boolean {
  return !!row?.thumbnailUrl;
}

function capCuts(ranked: string[], served: (id: string) => boolean): string[] {
  let serving = 0;
  let pending = 0;
  return ranked.filter((id) =>
    served(id) ? serving++ < MAX_CUTS : pending++ < PENDING_CUTS
  );
}

const CUT_LOOKUP_BATCH = 1000;

export type SongIdentity = Omit<
  KaraokeSongDoc,
  "cuts" | "topVideoId" | "addCount" | "addsByCountry" | "lastAddedAt" | "demand"
>;

export function songIdentityFromCatalog(entry: CatalogEntry): SongIdentity {
  return {
    _id: entry.key,
    title: entry.title,
    artist: entry.artist,
    ...(entry.nativeTitle ? { nativeTitle: entry.nativeTitle } : {}),
    ...(entry.nativeArtist ? { nativeArtist: entry.nativeArtist } : {}),
    // Not [entry.packId]: the catalog dedupes to one entry, but a song curated
    // in both "core" and "cz" belongs to both.
    packIds: catalogPackIds(entry.key),
  };
}

function songIdentityFields(entry: CatalogEntry): Record<string, unknown> {
  const { _id, ...identity } = songIdentityFromCatalog(entry);
  return identity;
}

export interface AddedVideo {
  videoId: string;
  title: string;
  durationSeconds?: number;
}

export interface AddSource {
  roomId: string;
  country?: string;
  suggestionKey?: string;
  via: "search" | "paste";
}

// The value becomes a field name in addsByCountry: dots would write a nested
// path, "$" is rejected outright, and anything longer grows the map unbounded.
function countryField(country?: string): string | undefined {
  return country && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : undefined;
}

/** Await after the response, never drop: a dropped promise dies with the frozen
 *  instance, leaving the video's counters and the song's cuts disagreeing. */
export function recordAdd(video: AddedVideo, opts: AddSource): Promise<void> {
  return writeAdd(video, opts).catch(() => {});
}

async function writeAdd(video: AddedVideo, opts: AddSource): Promise<void> {
  const country = countryField(opts.country);
  const now = new Date();
  const videos = await getKaraokeVideosCollection();
  const known = await videos.findOne({ _id: video.videoId });

  // Both halves came from a client: unchecked, a crafted add publishes any video
  // as any song's answer for every room. Judged on the stored title where there
  // is one — only that came from videos.list.
  const named =
    opts.via === "search" && opts.suggestionKey
      ? catalogEntry(opts.suggestionKey)
      : undefined;
  const entry =
    named && isCutOf(known?.title ?? video.title, named) ? named : undefined;

  const set: Record<string, unknown> = { "sources.adds.lastAt": now };

  const inc: Record<string, number> = { "sources.adds.count": 1 };
  if (country) inc[`sources.adds.byCountry.${country}`] = 1;

  // $setOnInsert, never $set: $set-ing the title hands every room whatever one
  // request body said, and bumping refreshedAt renews the TTL on traffic alone.
  const onInsert: Record<string, unknown> = {
    title: video.title,
    // Blank, never the client's: readSongCuts serves only rows with a picture.
    thumbnailUrl: "",
    firstSeenAt: now,
    refreshedAt: now,
  };
  if (video.durationSeconds !== undefined) {
    onInsert.durationSeconds = video.durationSeconds;
  }
  if (!country) onInsert["sources.adds.byCountry"] = {};

  const addToSet: Record<string, unknown> = {};
  if (entry) addToSet.songKeys = entry.key;
  if ((known?.sources?.adds?.rooms ?? []).length < MIN_ADD_ROOMS) {
    addToSet["sources.adds.rooms"] = opts.roomId;
  }

  await videos.updateOne(
    { _id: video.videoId },
    {
      $set: set,
      $inc: inc,
      $setOnInsert: onInsert,
      ...(Object.keys(addToSet).length > 0 ? { $addToSet: addToSet } : {}),
    },
    { upsert: true }
  );

  if (!entry) return;
  await fileCut(entry, video.videoId, country, now);
}

/** Re-derives the whole list: rank is a function of who added each cut. Racing
 *  adds cost the loser its place until the sweep regroups; $inc counts survive. */
async function fileCut(
  entry: CatalogEntry,
  videoId: string,
  country: string | undefined,
  now: Date
): Promise<void> {
  const songs = await getKaraokeSongsCollection();
  const videos = await getKaraokeVideosCollection();
  const song = await songs.findOne({ _id: entry.key });

  const existing = song?.cuts ?? [];
  const ids = existing.indexOf(videoId) >= 0 ? existing : existing.concat(videoId);
  const rows = await videos
    .find({ _id: { $in: ids } }, { projection: { sources: 1, thumbnailUrl: 1 } })
    .toArray();
  const backing = new Map(
    rows.map((r) => [
      r._id,
      {
        adds: r.sources?.adds?.count ?? 0,
        rooms: (r.sources?.adds?.rooms ?? []).length,
        served: isServable(r),
      },
    ])
  );

  // karaoke_songs has no TTL: dropping expired cuts is what stops ids stranding.
  const live = ids.filter((id) => backing.has(id));

  // Rooms before raw adds: one room adding a cut fifty times must not outrank
  // the cut two rooms chose. Stable, so unadded harvest rows keep their order.
  const ranked = live.slice().sort((a, b) => {
    const x = backing.get(a)!;
    const y = backing.get(b)!;
    return y.rooms - x.rooms || y.adds - x.adds;
  });
  const cuts = capCuts(ranked, (id) => backing.get(id)!.served);
  // Servability isn't a condition: pinTopFirst skips a pin no served row matches,
  // so the badge lands the night the sweep names the row, not on a third add.
  const top = cuts.find((id) => backing.get(id)!.rooms >= MIN_ADD_ROOMS);

  const update: UpdateFilter<KaraokeSongDoc> = {
    $set: {
      ...songIdentityFields(entry),
      cuts,
      lastAddedAt: now,
      ...(top ? { topVideoId: top } : {}),
    },
    $inc: {
      addCount: 1,
      ...(country ? { [`addsByCountry.${country}`]: 1 } : {}),
    },
    // The $inc above creates addCount and, given a country, the tally too — a
    // field can't be in both operators.
    $setOnInsert: {
      demand: 0,
      ...(country ? {} : { addsByCountry: {} }),
    },
  };
  if (!top && song?.topVideoId) update.$unset = { topVideoId: "" };

  await songs.updateOne({ _id: entry.key }, update, { upsert: true });
}

/** Idempotent: a run that dies mid-sweep can simply be run again. */
export async function recordHarvestMatches(
  matches: Map<string, MatchedVideo[]>,
  details: Map<string, SearchResult>
): Promise<{
  videosUpserted: number;
  videosRefreshed: number;
  songsFilled: number;
  /** Songs now at the cut cap, so the caller can stop matching them. */
  full: string[];
}> {
  if (matches.size === 0) {
    return { videosUpserted: 0, videosRefreshed: 0, songsFilled: 0, full: [] };
  }
  const now = new Date();
  const videos = await getKaraokeVideosCollection();
  const songs = await getKaraokeSongsCollection();

  // One op per video, never per (video, song): the matcher files an upload under
  // every song it covers, and a second op on that _id overwrites the grouping.
  const pending = new Map<
    string,
    { set: Record<string, unknown>; songKeys: string[] }
  >();
  matches.forEach((rows, songKey) => {
    for (const row of rows) {
      const seen = pending.get(row.videoId);
      if (seen) {
        if (seen.songKeys.indexOf(songKey) < 0) seen.songKeys.push(songKey);
        continue;
      }
      const enriched = details.get(row.videoId);
      const set: Record<string, unknown> = {
        title: enriched?.title ?? row.title,
        thumbnailUrl: enriched?.thumbnailUrl || row.thumbnailUrl,
        refreshedAt: now,
        "sources.harvest": { channel: row.channel, matchedAt: now },
      };
      if (enriched?.durationSeconds !== undefined) {
        set.durationSeconds = enriched.durationSeconds;
      }
      if (enriched?.viewCount !== undefined) set.viewCount = enriched.viewCount;
      pending.set(row.videoId, { set, songKeys: [songKey] });
    }
  });

  const ops: AnyBulkWriteOperation<KaraokeVideoDoc>[] = [];
  pending.forEach((row, videoId) => {
    ops.push({
      updateOne: {
        filter: { _id: videoId },
        update: {
          $set: row.set,
          $addToSet: { songKeys: { $each: row.songKeys } },
          $setOnInsert: { firstSeenAt: now },
        },
        upsert: true,
      },
    });
  });

  let videosUpserted = 0;
  let videosRefreshed = 0;
  if (ops.length > 0) {
    try {
      const written = await videos.bulkWrite(ops, { ordered: false });
      videosUpserted = written.upsertedCount;
      videosRefreshed = written.modifiedCount;
    } catch (e: any) {
      console.warn("Harvest video write partly failed:", e?.message);
    }
  }

  const songKeys = Array.from(matches.keys());
  const stored = new Map(
    (await songs.find({ _id: { $in: songKeys } }).toArray()).map((s) => [s._id, s])
  );

  // A TTL deletion announces itself to nothing: an expired cut survives on the
  // song, looking resolved, until a pass drops it.
  const alive = new Set(pending.keys());
  // The cap counts what a tap can actually be served (capCuts), so a song's
  // free slots are its unproven cuts plus its expired ones, not its id count.
  const served = new Set<string>();
  pending.forEach((row, videoId) => {
    if (isServable(row.set as { thumbnailUrl?: string })) served.add(videoId);
  });
  const held = Array.from(
    new Set(Array.from(stored.values()).flatMap((s) => s.cuts ?? []))
  ).filter((id) => !alive.has(id));
  for (let i = 0; i < held.length; i += CUT_LOOKUP_BATCH) {
    const rows = await videos
      .find(
        { _id: { $in: held.slice(i, i + CUT_LOOKUP_BATCH) } },
        { projection: { _id: 1, thumbnailUrl: 1 } }
      )
      .toArray();
    for (const row of rows) {
      alive.add(row._id);
      if (isServable(row)) served.add(row._id);
    }
  }

  const songOps: AnyBulkWriteOperation<KaraokeSongDoc>[] = [];
  const full: string[] = [];
  let songsFilled = 0;
  for (const songKey of songKeys) {
    const entry = catalogEntry(songKey);
    const song = stored.get(songKey);
    if (!song && !entry) continue;

    const filed = song?.cuts ?? [];
    const dead = filed.filter((id) => !alive.has(id));
    const kept = filed.filter((id) => alive.has(id));
    let serving = kept.filter((id) => served.has(id)).length;
    const added: string[] = [];
    for (const row of matches.get(songKey) ?? []) {
      if (serving >= MAX_CUTS) break;
      // Appended: a harvest match is evidence the cut exists, not that it's wanted.
      if (kept.indexOf(row.videoId) >= 0 || added.indexOf(row.videoId) >= 0) continue;
      added.push(row.videoId);
      if (served.has(row.videoId)) serving += 1;
    }
    if (added.length > 0) songsFilled += 1;
    if (serving >= MAX_CUTS) full.push(songKey);

    // $addToSet and $pull, never the list back: this read is minutes old by the
    // time it lands, so a room's concurrent add would be reverted — or, with
    // $push, left in the array twice and served twice.
    const update: UpdateFilter<KaraokeSongDoc> = {
      ...(added.length > 0 ? { $addToSet: { cuts: { $each: added } } } : {}),
      ...(entry ? { $set: songIdentityFields(entry) } : {}),
    };
    // An empty operator is an error, and a stored song can't be inserted anyway.
    if (entry) {
      update.$setOnInsert = {
        demand: 0,
        addCount: 0,
        addsByCountry: {},
      };
    }
    if (Object.keys(update).length > 0) {
      // Upsert only alongside the push: $setOnInsert can't seed a cuts array the
      // $addToSet writes, and readers that $size it throw on a doc without one.
      songOps.push({
        updateOne: { filter: { _id: songKey }, update, upsert: added.length > 0 },
      });
    }
    // A separate op: one update can't both $addToSet and $pull the same field.
    if (dead.length > 0) {
      songOps.push({
        updateOne: {
          filter: { _id: songKey },
          update: { $pull: { cuts: { $in: dead } } },
        },
      });
    }
  }
  if (songOps.length > 0) {
    try {
      await songs.bulkWrite(songOps, { ordered: false });
    } catch (e: any) {
      console.warn("Harvest song write partly failed:", e?.message);
    }
  }

  return { videosUpserted, videosRefreshed, songsFilled, full };
}

/** Songs under this get leftover search budget rather than it going unspent. */
export const THIN_CUTS = 10;

const RESOLVE_BACKOFF_DAYS = [1, 2, 4, 8, 16, 32];

/** The resolver's queues order on demand and don't write on a miss, so without
 *  this an unresolvable song holds the head of the list and re-buys it forever. */
export async function markResolveMiss(songKey: string): Promise<void> {
  const songs = await getKaraokeSongsCollection();
  const song = await songs.findOne(
    { _id: songKey },
    { projection: { resolveMisses: 1 } }
  );
  const misses = (song?.resolveMisses ?? 0) + 1;
  const days = RESOLVE_BACKOFF_DAYS[Math.min(misses, RESOLVE_BACKOFF_DAYS.length) - 1];
  await songs.updateOne(
    { _id: songKey },
    {
      $inc: { resolveMisses: 1 },
      $set: { nextResolveAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000) },
    }
  );
}

/** Rewriting refreshedAt is what keeps a served video out of the TTL's way. */
export async function refreshVideos(rows: SearchResult[]): Promise<number> {
  if (rows.length === 0) return 0;
  const now = new Date();
  const videos = await getKaraokeVideosCollection();
  const ops: AnyBulkWriteOperation<KaraokeVideoDoc>[] = rows.map((row) => ({
    updateOne: {
      // No upsert: the sweep only re-reads ids the corpus already holds, and a
      // row the TTL collected mid-run must not be written back.
      filter: { _id: row.videoId },
      update: {
        $set: {
          refreshedAt: now,
          // fetchVideoRows defaults both to "", and blanking a stored one costs
          // the browse row its name or picture until the next sweep.
          ...(row.title ? { title: row.title } : {}),
          ...(row.thumbnailUrl ? { thumbnailUrl: row.thumbnailUrl } : {}),
          ...(row.durationSeconds !== undefined
            ? { durationSeconds: row.durationSeconds }
            : {}),
          ...(row.viewCount !== undefined ? { viewCount: row.viewCount } : {}),
        },
      },
    },
  }));
  try {
    const written = await videos.bulkWrite(ops, { ordered: false });
    return written.modifiedCount;
  } catch (e: any) {
    console.warn("Sweep refresh partly failed:", e?.message);
    return 0;
  }
}

/** Songs first: killed between the two writes, that leaves an orphan row the TTL
 *  collects, where the other order leaves a dead cut. */
export async function dropVideos(
  videoIds: string[]
): Promise<{ dropped: number; cutsPulled: number; unpinned: number }> {
  if (videoIds.length === 0) return { dropped: 0, cutsPulled: 0, unpinned: 0 };
  const songs = await getKaraokeSongsCollection();
  const videos = await getKaraokeVideosCollection();

  // Read before the pull: updateMany reports docs touched, not array elements,
  // so its count is not a cut count.
  const dying = new Set(videoIds);
  const naming = await songs
    .find({ cuts: { $in: videoIds } }, { projection: { cuts: 1 } })
    .toArray();
  const cutsPulled = naming.reduce(
    (total, song) => total + (song.cuts ?? []).filter((id) => dying.has(id)).length,
    0
  );
  await songs.updateMany(
    { cuts: { $in: videoIds } },
    { $pull: { cuts: { $in: videoIds } } }
  );
  const unpinned = await songs.updateMany(
    { topVideoId: { $in: videoIds } },
    { $unset: { topVideoId: "" } }
  );
  const deleted = await videos.deleteMany({ _id: { $in: videoIds } });
  return {
    dropped: deleted.deletedCount,
    cutsPulled,
    unpinned: unpinned.modifiedCount,
  };
}

/** The sweep is where YouTube first names a row an add filed on a client's title,
 *  so the match is re-run against the real one. Add-sourced rows only: the other
 *  sources were never matched on a client's string. */
export async function unfileUnprovenCuts(
  fresh: Map<string, SearchResult>
): Promise<{ pulled: number; unpinned: number }> {
  if (fresh.size === 0) return { pulled: 0, unpinned: 0 };
  const videos = await getKaraokeVideosCollection();
  const rows = await videos
    .find(
      {
        _id: { $in: Array.from(fresh.keys()) },
        songKeys: { $exists: true, $ne: [] },
        "sources.adds": { $exists: true },
        "sources.harvest": { $exists: false },
        "sources.search": { $exists: false },
        "sources.seed": { $exists: false },
      },
      { projection: { songKeys: 1 } }
    )
    .toArray();

  const unproven = new Map<string, string[]>();
  for (const row of rows) {
    const title = fresh.get(row._id)?.title;
    if (!title) continue;
    const failed = (row.songKeys ?? []).filter((key) => {
      const entry = catalogEntry(key);
      // A song the catalog has since dropped can't be re-checked.
      return entry ? !isCutOf(title, entry) : false;
    });
    if (failed.length > 0) unproven.set(row._id, failed);
  }
  if (unproven.size === 0) return { pulled: 0, unpinned: 0 };

  const songs = await getKaraokeSongsCollection();
  const pullOps: AnyBulkWriteOperation<KaraokeSongDoc>[] = [];
  const unpinOps: AnyBulkWriteOperation<KaraokeSongDoc>[] = [];
  const videoOps: AnyBulkWriteOperation<KaraokeVideoDoc>[] = [];
  unproven.forEach((keys, videoId) => {
    for (const key of keys) {
      pullOps.push({
        updateOne: { filter: { _id: key }, update: { $pull: { cuts: videoId } } },
      });
      unpinOps.push({
        updateOne: {
          filter: { _id: key, topVideoId: videoId },
          update: { $unset: { topVideoId: "" } },
        },
      });
    }
    // Or another add re-files it on the same unchecked claim.
    videoOps.push({
      updateOne: {
        filter: { _id: videoId },
        update: { $pull: { songKeys: { $in: keys } } },
      },
    });
  });

  let pulled = 0;
  let unpinned = 0;
  try {
    pulled = (await songs.bulkWrite(pullOps, { ordered: false })).modifiedCount;
    unpinned = (await songs.bulkWrite(unpinOps, { ordered: false })).modifiedCount;
    await videos.bulkWrite(videoOps, { ordered: false });
  } catch (e: any) {
    console.warn("Unproven cut cleanup partly failed:", e?.message);
  }
  return { pulled, unpinned };
}

/** Only rows that become cuts are stored: every extra id is one the sweep must
 *  re-read forever for a song that will never serve it. */
export async function recordSearchResults(
  songKey: string,
  results: SearchResult[]
): Promise<{ videosUpserted: number; cutsAdded: number }> {
  if (results.length === 0) return { videosUpserted: 0, cutsAdded: 0 };
  const songs = await getKaraokeSongsCollection();
  const videos = await getKaraokeVideosCollection();
  // No upsert: a search result can name a song but never create one.
  const song = await songs.findOne({ _id: songKey });
  if (!song) return { videosUpserted: 0, cutsAdded: 0 };

  // An expired cut still occupies a slot until a writer drops it.
  const held = song.cuts ?? [];
  const rows =
    held.length === 0
      ? []
      : await videos
          .find({ _id: { $in: held } }, { projection: { _id: 1, thumbnailUrl: 1 } })
          .toArray();
  const alive = new Set(rows.map((r) => r._id));

  const cuts = held.filter((id) => alive.has(id));
  // Servable rows only: unnamed rows must not turn a paid search away.
  let serving = rows.filter((row) => isServable(row)).length;
  const fresh: SearchResult[] = [];
  for (const row of results) {
    if (serving >= MAX_CUTS) break;
    // Appended: relevance order is YouTube's opinion, the leading cuts are ours.
    if (cuts.indexOf(row.videoId) >= 0) continue;
    cuts.push(row.videoId);
    fresh.push(row);
    if (isServable(row)) serving += 1;
  }

  const now = new Date();
  let videosUpserted = 0;
  if (fresh.length > 0) {
    const ops: AnyBulkWriteOperation<KaraokeVideoDoc>[] = fresh.map((row) => ({
      updateOne: {
        filter: { _id: row.videoId },
        update: {
          $set: {
            title: row.title,
            thumbnailUrl: row.thumbnailUrl,
            refreshedAt: now,
            "sources.search": { at: now },
            ...(row.durationSeconds !== undefined
              ? { durationSeconds: row.durationSeconds }
              : {}),
            ...(row.viewCount !== undefined ? { viewCount: row.viewCount } : {}),
          },
          $addToSet: { songKeys: songKey },
          $setOnInsert: { firstSeenAt: now },
        },
        upsert: true,
      },
    }));
    try {
      const written = await videos.bulkWrite(ops, { ordered: false });
      videosUpserted = written.upsertedCount;
    } catch (e: any) {
      console.warn("Resolve video write partly failed:", e?.message);
    }
  }

  // Also written when nothing was added: the filter may have dropped a dead id.
  if (cuts.length !== held.length || fresh.length > 0) {
    await songs.updateOne(
      { _id: songKey },
      {
        $set: { cuts },
        ...(fresh.length > 0
          ? { $unset: { resolveMisses: "", nextResolveAt: "" } }
          : {}),
      }
    );
  }
  return { videosUpserted, cutsAdded: fresh.length };
}

/** Rewritten nightly, not seeded once: the resolver's queues order on it, so a
 *  frozen score spends every later day's searches on last month's taste. */
export async function recordDemand(demand: Map<string, number>): Promise<number> {
  if (demand.size === 0) return 0;
  const songs = await getKaraokeSongsCollection();
  const ops: AnyBulkWriteOperation<KaraokeSongDoc>[] = [];
  // No upsert: a key with no doc is a song the catalog has since retired.
  demand.forEach((count, key) => {
    ops.push({
      updateOne: { filter: { _id: key }, update: { $set: { demand: count } } },
    });
  });
  try {
    return (await songs.bulkWrite(ops, { ordered: false })).modifiedCount;
  } catch (e: any) {
    console.warn("Demand write partly failed:", e?.message);
    return 0;
  }
}
