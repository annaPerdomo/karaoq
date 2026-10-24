import { CHART_SIZE } from "./chartFeed";
import {
  getChartSnapshotsCollection,
  getKaraokeSongsCollection,
  getKaraokeVideosCollection,
  getSuggestionCacheCollection,
  getYoutubeSongDataCollection,
  type ChartSnapshotDoc,
} from "./mongodb";
import type { IdeaShelf, ShelfSong } from "./shelfTypes";

// The idea shelves: what's charting where the singer is, and what KaraoQ rooms
// have actually been queuing. Both are built only from songs the corpus can
// serve this second — a shelf card opens its cut with no search behind it.

export const SHELF_SIZE = 20;
export const ROOMS_WINDOW_DAYS = 14;
/** One room hammering a song isn't "what rooms are singing". */
export const MIN_ROOMS_PER_SONG = 2;
/** Below this a country's rooms shelf is too thin to beat the worldwide one. */
export const MIN_COUNTRY_ROOM_SONGS = 8;
export const NEW_FOR_DAYS = 7;
export const SHELF_REFRESH_MS = 3 * 60 * 60 * 1000;
/** No hot shelf means no chart snapshot yet (a fresh deploy before the first
 *  charts step) or a dead feed — look again soon rather than in three hours. */
export const SHELF_RETRY_MS = 15 * 60 * 1000;

export function shelvesFreshFor(shelves: IdeaShelf[]): number {
  return shelves.some((s) => s.id === "hot") ? SHELF_REFRESH_MS : SHELF_RETRY_MS;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const QUERY_TIMEOUT_MS = 5000;
/** Cuts tried per song before giving up on finding a servable one. */
const CUTS_TRIED = 6;

// The corpus counts an instrumental as a cut (suggestionMatch), but a shelf card
// is a promise you can sing along: no lyrics on screen, no card. A title that
// says karaoke or lyrics outright wins over the word "instrumental".
const SINGALONG =
  /karaoke|karaokê|lyric|letra|paroles|songtext|sing[- ]?along|ktv|カラオケ|노래방|卡拉|कराओके/i;
const NO_LYRICS = /instrumental|backing track|off\s*vocal|オフボーカル/i;

export function isSingAlong(videoTitle: string): boolean {
  return SINGALONG.test(videoTitle) || !NO_LYRICS.test(videoTitle);
}

function artistKey(artist: string): string {
  return artist.trim().toLowerCase();
}

interface Ranked {
  key: string;
  rank?: number;
  climb?: number;
  isNew?: boolean;
  rooms?: number;
}

/** A charted country's own chart, else every chart pooled by points. */
export function rankHot(
  snapshots: ChartSnapshotDoc[],
  country: string | null,
  now: Date
): { country: string | null; ranked: Ranked[] } {
  const own = country
    ? snapshots.find((s) => s._id === country.toLowerCase())
    : undefined;
  if (own) {
    const prev = new Map((own.prevRanks ?? []).map((r) => [r.key, r.rank]));
    const newSince = now.getTime() - NEW_FOR_DAYS * DAY_MS;
    return {
      country: country!.toUpperCase(),
      ranked: own.ranks
        .slice()
        .sort((a, b) => a.rank - b.rank)
        .map((r) => {
          const was = prev.get(r.key);
          return {
            key: r.key,
            rank: r.rank,
            ...(was !== undefined && was !== r.rank ? { climb: was - r.rank } : {}),
            ...(r.since && r.since.getTime() > newSince ? { isNew: true } : {}),
          };
        }),
    };
  }

  const points = new Map<string, number>();
  for (const snap of snapshots) {
    for (const r of snap.ranks) {
      points.set(r.key, (points.get(r.key) ?? 0) + CHART_SIZE + 1 - r.rank);
    }
  }
  const ranked = Array.from(points.entries())
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([key], i) => ({ key, rank: i + 1 }));
  return { country: null, ranked };
}

export interface RoomAdd {
  roomId: string;
  country?: string;
  songKey: string;
}

/** Ranked by distinct rooms, not raw adds: one enthusiastic room shouldn't top it. */
export function rankRooms(
  adds: RoomAdd[],
  country: string | null
): { country: string | null; ranked: Ranked[] } {
  const tally = (rows: RoomAdd[]) => {
    const rooms = new Map<string, Set<string>>();
    const count = new Map<string, number>();
    for (const row of rows) {
      if (!rooms.has(row.songKey)) rooms.set(row.songKey, new Set());
      rooms.get(row.songKey)!.add(row.roomId);
      count.set(row.songKey, (count.get(row.songKey) ?? 0) + 1);
    }
    return Array.from(rooms.entries())
      .map(([key, set]) => ({ key, rooms: set.size, adds: count.get(key)! }))
      .filter((r) => r.rooms >= MIN_ROOMS_PER_SONG)
      .sort((a, b) => b.rooms - a.rooms || b.adds - a.adds || (a.key < b.key ? -1 : 1))
      .map(({ key, rooms }) => ({ key, rooms }));
  };

  if (country) {
    const cc = country.toUpperCase();
    const local = tally(adds.filter((a) => a.country === cc));
    if (local.length >= MIN_COUNTRY_ROOM_SONGS) return { country: cc, ranked: local };
  }
  return { country: null, ranked: tally(adds) };
}

/** Artists a pack or chart credits by name. A promoted ("demand") song's name is
 *  inferred from video titles and is sometimes swapped ("Thriller — Michael
 *  Jackson" as artist "Thriller"), so a shelf trusts one only when its artist is
 *  one of these. */
export async function readTrustedArtists(): Promise<Set<string>> {
  const songs = await getKaraokeSongsCollection();
  const rows = await songs
    .find({ origin: { $ne: "demand" } }, { projection: { artist: 1 } })
    .maxTimeMS(QUERY_TIMEOUT_MS)
    .toArray();
  return new Set(rows.map((r) => artistKey(r.artist ?? "")));
}

/** Walks `ranked` in order, keeping only songs with a servable sing-along cut,
 *  until full. */
export async function hydrateShelf(
  ranked: Ranked[],
  skip: Set<string>,
  trustedArtists: Set<string>
): Promise<ShelfSong[]> {
  const candidates = ranked.filter((r) => !skip.has(r.key)).slice(0, SHELF_SIZE * 3);
  if (candidates.length === 0) return [];

  const songs = await getKaraokeSongsCollection();
  const docs = await songs
    .find(
      { _id: { $in: candidates.map((c) => c.key) }, retired: { $ne: true } },
      {
        projection: {
          title: 1,
          artist: 1,
          nativeTitle: 1,
          nativeArtist: 1,
          cuts: 1,
          topVideoId: 1,
          origin: 1,
        },
      }
    )
    .maxTimeMS(QUERY_TIMEOUT_MS)
    .toArray();
  const byKey = new Map(
    docs
      .filter((d) => d.origin !== "demand" || trustedArtists.has(artistKey(d.artist ?? "")))
      .map((d) => [d._id, d])
  );

  // The "Most sung" cut first: it's the one rooms already converged on.
  const tryOrder = new Map<string, string[]>();
  for (const doc of docs) {
    const cuts = doc.cuts ?? [];
    const top = doc.topVideoId && cuts.indexOf(doc.topVideoId) >= 0 ? [doc.topVideoId] : [];
    tryOrder.set(
      doc._id,
      top.concat(cuts.filter((id) => id !== doc.topVideoId)).slice(0, CUTS_TRIED)
    );
  }
  const ids = Array.from(new Set(Array.from(tryOrder.values()).flat()));
  if (ids.length === 0) return [];

  const videos = await getKaraokeVideosCollection();
  const rows = new Map(
    (
      await videos
        .find(
          { _id: { $in: ids } },
          { projection: { title: 1, thumbnailUrl: 1, durationSeconds: 1 } }
        )
        .maxTimeMS(QUERY_TIMEOUT_MS)
        .toArray()
    ).map((row) => [row._id, row])
  );

  const out: ShelfSong[] = [];
  for (const c of candidates) {
    if (out.length >= SHELF_SIZE) break;
    const doc = byKey.get(c.key);
    if (!doc) continue;
    // A blank thumbnail is a row only an add wrote — not ours to serve (corpusRead).
    const videoId = (tryOrder.get(c.key) ?? []).find((id) => {
      const row = rows.get(id);
      return !!row?.thumbnailUrl && isSingAlong(row.title ?? "");
    });
    if (!videoId) continue;
    const row = rows.get(videoId)!;
    out.push({
      key: doc._id,
      title: doc.title,
      artist: doc.artist,
      ...(doc.nativeTitle ? { nativeTitle: doc.nativeTitle } : {}),
      ...(doc.nativeArtist ? { nativeArtist: doc.nativeArtist } : {}),
      videoId,
      videoTitle: row.title,
      thumbnailUrl: row.thumbnailUrl,
      ...(row.durationSeconds !== undefined ? { durationSeconds: row.durationSeconds } : {}),
      ...(c.rank !== undefined ? { rank: c.rank } : {}),
      ...(c.climb !== undefined ? { climb: c.climb } : {}),
      ...(c.isNew ? { isNew: true } : {}),
      ...(c.rooms !== undefined ? { rooms: c.rooms } : {}),
    });
  }
  return out;
}

/** The window's adds mapped onto corpus songs; an add no song claims is dropped. */
export async function readRoomAdds(now: Date): Promise<RoomAdd[]> {
  const since = new Date(now.getTime() - ROOMS_WINDOW_DAYS * DAY_MS);
  const songData = await getYoutubeSongDataCollection();
  const added = await songData
    .find(
      { type: "song_added", timestamp: { $gte: since }, videoId: { $exists: true } },
      { projection: { roomId: 1, country: 1, videoId: 1 } }
    )
    .maxTimeMS(QUERY_TIMEOUT_MS)
    .toArray();
  if (added.length === 0) return [];

  const videoIds = Array.from(
    new Set(added.map((a) => a.videoId).filter((id): id is string => !!id))
  );
  const songs = await getKaraokeSongsCollection();
  const owners = await songs
    .find(
      { cuts: { $in: videoIds }, retired: { $ne: true } },
      { projection: { cuts: 1 } }
    )
    .maxTimeMS(QUERY_TIMEOUT_MS)
    .toArray();
  const songOf = new Map<string, string>();
  for (const song of owners) {
    for (const id of song.cuts ?? []) if (!songOf.has(id)) songOf.set(id, song._id);
  }

  const out: RoomAdd[] = [];
  for (const a of added) {
    const songKey = a.videoId ? songOf.get(a.videoId) : undefined;
    if (songKey) out.push({ roomId: a.roomId, country: a.country, songKey });
  }
  return out;
}

export async function computeShelves(
  country: string | null,
  now: Date = new Date()
): Promise<IdeaShelf[]> {
  const snapshots = await getChartSnapshotsCollection();
  const [charts, adds, trusted] = await Promise.all([
    snapshots.find({}).maxTimeMS(QUERY_TIMEOUT_MS).toArray(),
    readRoomAdds(now),
    readTrustedArtists(),
  ]);

  const hot = rankHot(charts, country, now);
  const hotSongs = await hydrateShelf(hot.ranked, new Set(), trusted);
  // The rooms shelf is for what the charts don't already say.
  const rooms = rankRooms(adds, country);
  const roomSongs = await hydrateShelf(
    rooms.ranked,
    new Set(hotSongs.map((s) => s.key)),
    trusted
  );

  const shelves: IdeaShelf[] = [];
  if (hotSongs.length > 0) shelves.push({ id: "hot", country: hot.country, songs: hotSongs });
  if (roomSongs.length > 0) shelves.push({ id: "rooms", country: rooms.country, songs: roomSongs });
  return shelves;
}

/** Lazily refreshed: the first request after the cached doc goes stale pays for
 *  one computation, and the CDN in front absorbs nearly everyone else. */
export async function getShelves(country: string | null): Promise<IdeaShelf[]> {
  const key = `shelves:v1:${country ?? "world"}`;
  const cache = await getSuggestionCacheCollection();
  const hit = await cache.findOne({ key });
  if (hit?.shelves && Date.now() - hit.computedAt.getTime() < shelvesFreshFor(hit.shelves)) {
    return hit.shelves;
  }
  try {
    const shelves = await computeShelves(country);
    await cache
      .updateOne({ key }, { $set: { key, shelves, computedAt: new Date() } }, { upsert: true })
      .catch(() => {});
    return shelves;
  } catch (e) {
    // A stale shelf beats an empty one while the database is struggling.
    if (hit?.shelves) return hit.shelves;
    throw e;
  }
}
