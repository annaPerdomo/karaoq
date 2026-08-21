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

// The only module that writes the corpus: every feeder lands here, so the cut
// cap and the ranking rule have one implementation rather than one each.

/** Past a dozen the list is scrolling rather than choosing, and every stored id
 *  is another row the nightly sweep must re-read to stay inside the 30-day rule. */
export const MAX_CUTS = 12;

/** Rooms are free to create, so one room's adds are a claim, not a consensus —
 *  never relax this to a raw add count. */
export const MIN_ADD_ROOMS = 2;

/** The song set is the catalog today; the chart feeder (phase 3) grows it. */
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

/** $set, never $setOnInsert: the names come from JSON a human edits, and an
 *  identity frozen at insert makes a spelling fix silently not happen. */
function songIdentityFields(entry: CatalogEntry): Record<string, unknown> {
  const { _id, ...identity } = songIdentityFromCatalog(entry);
  return identity;
}

export interface AddedVideo {
  videoId: string;
  title: string;
  thumbnailUrl?: string;
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

/** Never rejects, so a corpus failure is never an add's failure. Await it after
 *  the response, never drop it: a dropped promise dies with the frozen instance
 *  — measured at ~8% loss on this repo's analytics — and a half-written add
 *  leaves the video's counters and the song's cuts disagreeing for good. */
export function recordAdd(video: AddedVideo, opts: AddSource): Promise<void> {
  return writeAdd(video, opts).catch(() => {});
}

async function writeAdd(video: AddedVideo, opts: AddSource): Promise<void> {
  const country = countryField(opts.country);
  const now = new Date();
  const videos = await getKaraokeVideosCollection();
  const known = await videos.findOne({ _id: video.videoId });

  // Both halves came from a client, so the title has to prove the pairing: an
  // unchecked add files the cover a search returned under the song it searched
  // for, and a crafted one publishes any video as any song's answer for every
  // room. Judged on the stored title where there is one — only that came from
  // videos.list.
  const named =
    opts.via === "search" && opts.suggestionKey
      ? catalogEntry(opts.suggestionKey)
      : undefined;
  const entry =
    named && isCutOf(known?.title ?? video.title, named) ? named : undefined;

  const set: Record<string, unknown> = { "sources.adds.lastAt": now };

  const inc: Record<string, number> = { "sources.adds.count": 1 };
  if (country) inc[`sources.adds.byCountry.${country}`] = 1;

  // $setOnInsert, never $set — the sweep owns these after the first sighting.
  // $set-ing the title hands every room whatever one request body said, and
  // bumping refreshedAt renews an unrefreshed row's 30 days on traffic alone.
  const onInsert: Record<string, unknown> = {
    title: video.title,
    thumbnailUrl: video.thumbnailUrl ?? "",
    firstSeenAt: now,
    refreshedAt: now,
  };
  if (video.durationSeconds !== undefined) {
    onInsert.durationSeconds = video.durationSeconds;
  }
  if (!country) onInsert["sources.adds.byCountry"] = {};

  const addToSet: Record<string, unknown> = {};
  if (entry) addToSet.songKeys = entry.key;
  // Answers "more than one room?" — not a log, so it stops at the threshold.
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

/** Re-derives the cuts rather than pushing: the order is a function of who added
 *  each one, so one add can move the whole list. Two adds racing cost the loser
 *  its place until the sweep regroups; the counters are $inc, so no count is. */
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
    .find({ _id: { $in: ids } }, { projection: { sources: 1 } })
    .toArray();
  const backing = new Map(
    rows.map((r) => [
      r._id,
      {
        adds: r.sources?.adds?.count ?? 0,
        rooms: (r.sources?.adds?.rooms ?? []).length,
      },
    ])
  );

  // karaoke_songs has no TTL, so dropping cuts whose video row has expired is
  // what stops video ids stranding in a collection that never expires.
  const live = ids.filter((id) => backing.has(id));

  // Rooms before raw adds: one room adding a cut fifty times must not outrank
  // the cut two rooms chose. Stable, so unadded harvest rows keep their order.
  const ranked = live.slice().sort((a, b) => {
    const x = backing.get(a)!;
    const y = backing.get(b)!;
    return y.rooms - x.rooms || y.adds - x.adds;
  });
  // Best-backed first, so the cap can only drop rows the badge doesn't name.
  const cuts = ranked.slice(0, MAX_CUTS);
  const top = cuts.find((id) => (backing.get(id)?.rooms ?? 0) >= MIN_ADD_ROOMS);

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
  // Left dangling, the badge pins a video the song no longer serves.
  if (!top && song?.topVideoId) update.$unset = { topVideoId: "" };

  await songs.updateOne({ _id: entry.key }, update, { upsert: true });
}

/** Bulk feeder for the nightly channel harvest. Idempotent, so a run that dies
 *  mid-sweep can simply be run again. */
export async function recordHarvestMatches(
  matches: Map<string, MatchedVideo[]>,
  details: Map<string, SearchResult>
): Promise<{
  videosUpserted: number;
  videosRefreshed: number;
  songsFilled: number;
}> {
  if (matches.size === 0) {
    return { videosUpserted: 0, videosRefreshed: 0, songsFilled: 0 };
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
      // videos.list where the enrichment pass reached it, else the playlist's
      // row: a failed enrichment costs the badges, not the cut.
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
      // Unordered: one rejected row must not forfeit a night of catalog
      // progress that can't be earned back.
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

  // A TTL deletion announces itself to nothing, so an expired cut survives on
  // the song — looking resolved, keeping it out of the resolver's queue — until
  // a pass drops it. This is the only nightly writer an unadded song gets.
  const alive = new Set(pending.keys());
  const held = Array.from(
    new Set(Array.from(stored.values()).flatMap((s) => s.cuts ?? []))
  ).filter((id) => !alive.has(id));
  for (let i = 0; i < held.length; i += CUT_LOOKUP_BATCH) {
    const rows = await videos
      .find(
        { _id: { $in: held.slice(i, i + CUT_LOOKUP_BATCH) } },
        { projection: { _id: 1 } }
      )
      .toArray();
    for (const row of rows) alive.add(row._id);
  }

  const songOps: AnyBulkWriteOperation<KaraokeSongDoc>[] = [];
  let songsFilled = 0;
  for (const songKey of songKeys) {
    const entry = catalogEntry(songKey);
    const song = stored.get(songKey);
    // A doc with no title. The catalog bounds the corpus, here as on the add path.
    if (!song && !entry) continue;

    const before = (song?.cuts ?? []).filter((id) => alive.has(id));
    const cuts = before.slice();
    for (const row of matches.get(songKey) ?? []) {
      if (cuts.length >= MAX_CUTS) break;
      // Appended, never inserted: a harvest match is evidence the cut exists,
      // not that anyone wants it, and the leading rows are ranked by who did.
      if (cuts.indexOf(row.videoId) < 0) cuts.push(row.videoId);
    }
    if (cuts.length !== before.length) songsFilled += 1;

    const update: UpdateFilter<KaraokeSongDoc> = {
      $set: { cuts, ...(entry ? songIdentityFields(entry) : {}) },
    };
    // An empty operator is an error, and a stored song can't be inserted anyway.
    if (entry) {
      update.$setOnInsert = {
        demand: 0,
        addCount: 0,
        addsByCountry: {},
      };
    }
    songOps.push({ updateOne: { filter: { _id: songKey }, update, upsert: true } });
  }
  if (songOps.length > 0) {
    try {
      await songs.bulkWrite(songOps, { ordered: false });
    } catch (e: any) {
      console.warn("Harvest song write partly failed:", e?.message);
    }
  }

  return { videosUpserted, videosRefreshed, songsFilled };
}
