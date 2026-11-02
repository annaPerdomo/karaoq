import { CHART_SIZE } from "./chartFeed";
import { singAlongViews } from "./cutPick";
import { placeLanguage } from "./placeLanguage";
import {
  getChartSnapshotsCollection,
  getKaraokeSongsCollection,
  getSuggestionCacheCollection,
  getYoutubeSongDataCollection,
  type ChartSnapshotDoc,
  type KaraokeSongDoc,
} from "./mongodb";
import {
  COUNTRY_ROOMS_WINDOW_DAYS,
  ROOMS_WINDOW_DAYS,
  type IdeaShelf,
  type ShelfScope,
  type ShelfSong,
} from "./shelfTypes";

export { COUNTRY_ROOMS_WINDOW_DAYS, ROOMS_WINDOW_DAYS };

// The idea shelves: what's charting where the singer is (or in their
// language), and what KaraoQ rooms have actually been queuing. Both are built
// only from songs the corpus can serve this second — a tap opens the song's
// versions with no search behind it.

export const SHELF_SIZE = 20;
/** One room hammering a song isn't "what rooms are singing". */
export const MIN_ROOMS_PER_SONG = 2;
/** Below this a shelf is too thin to beat the next-wider one. */
export const MIN_SHELF_SONGS = 8;
export const MIN_COUNTRY_ROOM_SONGS = 5;
export const NEW_FOR_DAYS = 7;
/** A chart hit whose best karaoke video has fewer views than this is one
 *  nobody has shown they can sing — rap tracks, mostly. Rooms-shelf songs are
 *  already vetted by the rooms that queued them, so it applies to charts only. */
export const MIN_HOT_VIEWS = 5000;
export const SHELF_REFRESH_MS = 3 * 60 * 60 * 1000;
/** No hot shelf means no chart snapshot yet (a fresh deploy before the first
 *  charts step) or a dead feed — look again soon rather than in three hours. */
export const SHELF_RETRY_MS = 15 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;
const QUERY_TIMEOUT_MS = 5000;

/** Censored or slur titles — a chart can carry them, a bar's TV shouldn't. */
const UNSHOWABLE = /\*|\bn[i1]gg|\bf[a@]gg/i;

export const chartLanguage = placeLanguage;

export function shelvesFreshFor(shelves: IdeaShelf[]): number {
  return shelves.some((s) => s.id === "hot") ? SHELF_REFRESH_MS : SHELF_RETRY_MS;
}

interface Ranked {
  key: string;
  rank?: number;
  climb?: number;
  isNew?: boolean;
  /** Percent of the scope's singing rooms that queued it, rooms shelf only. */
  roomShare?: number;
}

/** One chart with its climbs and new entries. */
export function rankChart(snap: ChartSnapshotDoc, now: Date): Ranked[] {
  const prev = new Map((snap.prevRanks ?? []).map((r) => [r.key, r.rank]));
  const newSince = now.getTime() - NEW_FOR_DAYS * DAY_MS;
  return snap.ranks
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
    });
}

/** Several charts pooled by points: a song high on many beats one top of one. */
export function poolCharts(snaps: ChartSnapshotDoc[]): Ranked[] {
  const points = new Map<string, number>();
  for (const snap of snaps) {
    for (const r of snap.ranks) {
      points.set(r.key, (points.get(r.key) ?? 0) + CHART_SIZE + 1 - r.rank);
    }
  }
  return Array.from(points.entries())
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([key], i) => ({ key, rank: i + 1 }));
}

export interface ShelfPlan {
  scope: ShelfScope;
  country: string | null;
  language: string | null;
  ranked: Ranked[];
  minSongs?: number;
  windowDays?: number;
  /** Where a chart plan's songs came from, shown under the shelf. */
  chartCountries?: string[];
  updatedAt?: Date;
}

/** Which Apple charts a plan pooled, and when the newest was fetched. */
function provenance(snaps: ChartSnapshotDoc[]): { chartCountries: string[]; updatedAt?: Date } {
  const newest = snaps.reduce<Date | undefined>(
    (latest, snap) => (!latest || snap.fetchedAt > latest ? snap.fetchedAt : latest),
    undefined
  );
  return {
    chartCountries: snaps.map((snap) => snap._id.toUpperCase()),
    ...(newest ? { updatedAt: newest } : {}),
  };
}

/**
 * Hot plans narrowest first: the country's own chart, then the charts of its
 * language, then everything. The UI language only stands in when the country
 * is unknown — someone in Mexico with an English browser still wants Mexico.
 */
export function hotPlans(
  snaps: ChartSnapshotDoc[],
  country: string | null,
  language: string | null,
  now: Date
): ShelfPlan[] {
  const plans: ShelfPlan[] = [];
  const own = country ? snaps.find((s) => s._id === country.toLowerCase()) : undefined;
  if (own) {
    plans.push({
      scope: "country",
      country: country!.toUpperCase(),
      language: null,
      ranked: rankChart(own, now),
      ...provenance([own]),
    });
  }
  const lang = country ? chartLanguage(country) : language;
  const pool = lang ? snaps.filter((s) => chartLanguage(s._id) === lang) : [];
  // A pool of just the country's own chart would only repeat it.
  if (pool.length > 0 && !(own && pool.length === 1)) {
    plans.push({
      scope: "language",
      country: null,
      language: lang,
      ranked: pool.length === 1 ? rankChart(pool[0], now) : poolCharts(pool),
      ...provenance(pool),
    });
  }
  plans.push({
    scope: "world",
    country: null,
    language: null,
    ranked: poolCharts(snaps),
    ...provenance(snaps),
  });
  return plans;
}

export interface RoomAdd {
  roomId: string;
  country?: string;
  songKey: string;
  /** ms since epoch; absent counts as inside every window. */
  at?: number;
}

function tallyRooms(rows: RoomAdd[]): Ranked[] {
  const rooms = new Map<string, Set<string>>();
  const count = new Map<string, number>();
  for (const row of rows) {
    if (!rooms.has(row.songKey)) rooms.set(row.songKey, new Set());
    rooms.get(row.songKey)!.add(row.roomId);
    count.set(row.songKey, (count.get(row.songKey) ?? 0) + 1);
  }
  // A share, never a count: the count is ours to rank by, not to publish.
  const singing = new Set(rows.map((row) => row.roomId)).size;
  return Array.from(rooms.entries())
    .map(([key, set]) => ({ key, rooms: set.size, adds: count.get(key)! }))
    .filter((r) => r.rooms >= MIN_ROOMS_PER_SONG)
    .sort((a, b) => b.rooms - a.rooms || b.adds - a.adds || (a.key < b.key ? -1 : 1))
    .map(({ key, rooms: n }) => ({ key, roomShare: Math.max(1, Math.round((100 * n) / singing)) }));
}

/** Ranked by distinct rooms, not raw adds: one enthusiastic room shouldn't top
 *  it. Narrowest first — country, the language's rooms, then every room. */
export function roomPlans(
  all: RoomAdd[],
  country: string | null,
  language: string | null,
  now: Date = new Date()
): ShelfPlan[] {
  const plans: ShelfPlan[] = [];
  if (country) {
    const cc = country.toUpperCase();
    plans.push({
      scope: "country",
      country: cc,
      language: null,
      ranked: tallyRooms(all.filter((a) => a.country === cc)),
      minSongs: MIN_COUNTRY_ROOM_SONGS,
      windowDays: COUNTRY_ROOMS_WINDOW_DAYS,
    });
  }
  const since = now.getTime() - ROOMS_WINDOW_DAYS * DAY_MS;
  const adds = all.filter((a) => a.at === undefined || a.at >= since);
  const lang = country ? chartLanguage(country) : language;
  if (lang) {
    plans.push({
      scope: "language",
      country: null,
      language: lang,
      ranked: tallyRooms(adds.filter((a) => !!a.country && chartLanguage(a.country) === lang)),
      windowDays: ROOMS_WINDOW_DAYS,
    });
  }
  plans.push({
    scope: "world",
    country: null,
    language: null,
    ranked: tallyRooms(adds),
    windowDays: ROOMS_WINDOW_DAYS,
  });
  return plans;
}

function artistKey(artist: string): string {
  return artist.trim().toLowerCase();
}

/** Artists a pack or chart credits by name. A promoted ("demand") song's name is
 *  inferred from video titles and is sometimes swapped ("Thriller — Michael
 *  Jackson" as artist "Thriller"), so a shelf trusts one only when its artist is
 *  one of these. */
export async function readTrustedArtists(): Promise<Set<string>> {
  const songs = await getKaraokeSongsCollection();
  const rows = await songs
    .find({ origin: { $ne: "demand" }, genreChart: { $ne: true } }, { projection: { artist: 1 } })
    .maxTimeMS(QUERY_TIMEOUT_MS)
    .toArray();
  return new Set(rows.map((r) => artistKey(r.artist ?? "")));
}

interface ShowableSong {
  doc: Pick<KaraokeSongDoc, "_id" | "title" | "artist" | "nativeTitle" | "nativeArtist">;
  /** The best sing-along cut's views — absent means no such cut. */
  views?: number;
}

/** Songs a shelf may name, by key, with their sing-along view counts. One
 *  read for any number of shelves. */
export async function loadShowable(
  keys: string[],
  trustedArtists: Set<string>
): Promise<Map<string, ShowableSong>> {
  const out = new Map<string, ShowableSong>();
  if (keys.length === 0) return out;
  const songs = await getKaraokeSongsCollection();
  const docs = await songs
    .find(
      { _id: { $in: keys }, retired: { $ne: true } },
      {
        projection: {
          title: 1,
          artist: 1,
          nativeTitle: 1,
          nativeArtist: 1,
          cuts: 1,
          origin: 1,
        },
      }
    )
    .maxTimeMS(QUERY_TIMEOUT_MS)
    .toArray();
  const shown = docs.filter(
    (d) =>
      !UNSHOWABLE.test(`${d.title} ${d.artist}`) &&
      (d.origin !== "demand" || trustedArtists.has(artistKey(d.artist ?? "")))
  );
  const views = await singAlongViews(shown);
  for (const doc of shown) out.set(doc._id, { doc, views: views.get(doc._id) });
  return out;
}

/** Walks `ranked` in order, keeping songs that pass every quality gate, until full. */
export function assembleShelf(
  ranked: Ranked[],
  skip: Set<string>,
  showable: Map<string, ShowableSong>,
  minViews: number,
  renumber = false
): ShelfSong[] {
  const out: ShelfSong[] = [];
  for (const c of ranked) {
    if (out.length >= SHELF_SIZE) break;
    if (skip.has(c.key)) continue;
    const song = showable.get(c.key);
    if (!song || song.views === undefined || song.views < minViews) continue;
    const { doc } = song;
    out.push({
      key: doc._id,
      title: doc.title,
      artist: doc.artist,
      ...(doc.nativeTitle ? { nativeTitle: doc.nativeTitle } : {}),
      ...(doc.nativeArtist ? { nativeArtist: doc.nativeArtist } : {}),
      ...(c.rank !== undefined ? { rank: c.rank } : {}),
      ...(c.climb !== undefined ? { climb: c.climb } : {}),
      ...(c.isNew ? { isNew: true } : {}),
      ...(c.roomShare !== undefined ? { roomShare: c.roomShare } : {}),
    });
  }
  // Only pooled lists renumber: a single chart's ▲ and source line refer to Apple's ranks.
  if (renumber && out.some((s) => s.rank !== undefined)) {
    out.forEach((s, i) => {
      s.rank = i + 1;
    });
  }
  return out;
}

export async function hydrateShelf(
  ranked: Ranked[],
  skip: Set<string>,
  trustedArtists: Set<string>,
  minViews: number,
  renumber = false
): Promise<ShelfSong[]> {
  const candidates = ranked.filter((r) => !skip.has(r.key)).slice(0, SHELF_SIZE * 3);
  const showable = await loadShowable(candidates.map((c) => c.key), trustedArtists);
  return assembleShelf(candidates, skip, showable, minViews, renumber);
}

/** The window's adds mapped onto corpus songs; an add no song claims is dropped. */
export async function readRoomAdds(now: Date): Promise<RoomAdd[]> {
  const since = new Date(now.getTime() - COUNTRY_ROOMS_WINDOW_DAYS * DAY_MS);
  const songData = await getYoutubeSongDataCollection();
  const added = await songData
    .find(
      { type: "song_added", timestamp: { $gte: since }, videoId: { $exists: true } },
      { projection: { roomId: 1, country: 1, videoId: 1, timestamp: 1 } }
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
    if (songKey) {
      out.push({ roomId: a.roomId, country: a.country, songKey, at: a.timestamp.getTime() });
    }
  }
  return out;
}

export async function computeShelves(
  country: string | null,
  language: string | null,
  now: Date = new Date()
): Promise<IdeaShelf[]> {
  const snapshots = await getChartSnapshotsCollection();
  const [charts, adds, trusted] = await Promise.all([
    snapshots.find({}).maxTimeMS(QUERY_TIMEOUT_MS).toArray(),
    readRoomAdds(now),
    readTrustedArtists(),
  ]);

  const shelves: IdeaShelf[] = [];
  const shownKeys = new Set<string>();
  // The narrowest plan with enough songs to be worth a shelf; failing that,
  // whichever came closest.
  const place = async (id: IdeaShelf["id"], plans: ShelfPlan[], minViews: number) => {
    let best: { plan: ShelfPlan; songs: ShelfSong[] } | null = null;
    for (const plan of plans) {
      const pooled = (plan.chartCountries?.length ?? 0) > 1;
      const songs = await hydrateShelf(plan.ranked, shownKeys, trusted, minViews, pooled);
      if (!best || songs.length > best.songs.length) best = { plan, songs };
      if (songs.length >= (plan.minSongs ?? MIN_SHELF_SONGS)) break;
    }
    if (!best || best.songs.length === 0) return;
    best.songs.forEach((s) => shownKeys.add(s.key));
    const { scope, country: cc, language: lang, chartCountries, updatedAt, windowDays } = best.plan;
    shelves.push({
      id,
      scope,
      country: cc,
      language: lang,
      songs: best.songs,
      ...(chartCountries && chartCountries.length > 0 ? { chartCountries } : {}),
      ...(updatedAt ? { updatedAt: updatedAt.toISOString() } : {}),
      ...(windowDays ? { windowDays } : {}),
    });
  };

  await place("hot", hotPlans(charts, country, language, now), MIN_HOT_VIEWS);
  // The rooms shelf is for what the charts don't already say.
  await place("rooms", roomPlans(adds, country, language, now), 0);
  return shelves;
}

/** Lazily refreshed: the first request after the cached doc goes stale pays for
 *  one computation, and the CDN in front absorbs nearly everyone else. */
export async function getShelves(
  country: string | null,
  language: string | null = null
): Promise<IdeaShelf[]> {
  // The language only matters when the country is unknown (hotPlans).
  const lang = country ? null : language;
  const key = `shelves:v8:${country ?? "world"}:${lang ?? "-"}`;
  const cache = await getSuggestionCacheCollection();
  const hit = await cache.findOne({ key });
  if (hit?.shelves && Date.now() - hit.computedAt.getTime() < shelvesFreshFor(hit.shelves)) {
    return hit.shelves;
  }
  try {
    const shelves = await computeShelves(country, lang);
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
