import { CHART_SIZE } from "./chartFeed";
import { singAlongViews } from "./cutPick";
import { localeForCountry } from "./i18n/config";
import {
  getChartSnapshotsCollection,
  getKaraokeSongsCollection,
  getSuggestionCacheCollection,
  getYoutubeSongDataCollection,
  type ChartSnapshotDoc,
} from "./mongodb";
import type { IdeaShelf, ShelfScope, ShelfSong } from "./shelfTypes";

// The idea shelves: what's charting where the singer is (or in their
// language), and what KaraoQ rooms have actually been queuing. Both are built
// only from songs the corpus can serve this second — a tap opens the song's
// versions with no search behind it.

export const SHELF_SIZE = 20;
export const ROOMS_WINDOW_DAYS = 14;
/** One room hammering a song isn't "what rooms are singing". */
export const MIN_ROOMS_PER_SONG = 2;
/** Below this a shelf is too thin to beat the next-wider one. */
export const MIN_SHELF_SONGS = 8;
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

/** Charts whose language has no UI locale (lib/i18n/config maps the rest). */
const CHART_LANGUAGE: Record<string, string> = { tw: "zh", th: "th", in: "hi" };

export function chartLanguage(country: string): string {
  const cc = country.toLowerCase();
  return CHART_LANGUAGE[cc] ?? localeForCountry(cc) ?? "en";
}

export function shelvesFreshFor(shelves: IdeaShelf[]): number {
  return shelves.some((s) => s.id === "hot") ? SHELF_REFRESH_MS : SHELF_RETRY_MS;
}

interface Ranked {
  key: string;
  rank?: number;
  climb?: number;
  isNew?: boolean;
  rooms?: number;
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
    plans.push({ scope: "country", country: country!.toUpperCase(), language: null, ranked: rankChart(own, now) });
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
    });
  }
  plans.push({ scope: "world", country: null, language: null, ranked: poolCharts(snaps) });
  return plans;
}

export interface RoomAdd {
  roomId: string;
  country?: string;
  songKey: string;
}

function tallyRooms(rows: RoomAdd[]): Ranked[] {
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
    .map(({ key, rooms: n }) => ({ key, rooms: n }));
}

/** Ranked by distinct rooms, not raw adds: one enthusiastic room shouldn't top
 *  it. Narrowest first — country, the language's rooms, then every room. */
export function roomPlans(
  adds: RoomAdd[],
  country: string | null,
  language: string | null
): ShelfPlan[] {
  const plans: ShelfPlan[] = [];
  if (country) {
    const cc = country.toUpperCase();
    plans.push({ scope: "country", country: cc, language: null, ranked: tallyRooms(adds.filter((a) => a.country === cc)) });
  }
  const lang = country ? chartLanguage(country) : language;
  if (lang) {
    plans.push({
      scope: "language",
      country: null,
      language: lang,
      ranked: tallyRooms(adds.filter((a) => !!a.country && chartLanguage(a.country) === lang)),
    });
  }
  plans.push({ scope: "world", country: null, language: null, ranked: tallyRooms(adds) });
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
    .find({ origin: { $ne: "demand" } }, { projection: { artist: 1 } })
    .maxTimeMS(QUERY_TIMEOUT_MS)
    .toArray();
  return new Set(rows.map((r) => artistKey(r.artist ?? "")));
}

/** Walks `ranked` in order, keeping only songs that pass every quality gate,
 *  until full. */
export async function hydrateShelf(
  ranked: Ranked[],
  skip: Set<string>,
  trustedArtists: Set<string>,
  minViews: number
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
  const byKey = new Map(shown.map((d) => [d._id, d]));
  const views = await singAlongViews(shown);

  const out: ShelfSong[] = [];
  for (const c of candidates) {
    if (out.length >= SHELF_SIZE) break;
    const doc = byKey.get(c.key);
    const best = views.get(c.key);
    if (!doc || best === undefined || best < minViews) continue;
    out.push({
      key: doc._id,
      title: doc.title,
      artist: doc.artist,
      ...(doc.nativeTitle ? { nativeTitle: doc.nativeTitle } : {}),
      ...(doc.nativeArtist ? { nativeArtist: doc.nativeArtist } : {}),
      ...(c.rank !== undefined ? { rank: c.rank } : {}),
      ...(c.climb !== undefined ? { climb: c.climb } : {}),
      ...(c.isNew ? { isNew: true } : {}),
      ...(c.rooms !== undefined ? { rooms: c.rooms } : {}),
    });
  }
  // A pooled or filtered list renumbers, so a gap never reads as a missing song.
  if (out.some((s) => s.rank !== undefined)) {
    out.forEach((s, i) => {
      s.rank = i + 1;
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
      const songs = await hydrateShelf(plan.ranked, shownKeys, trusted, minViews);
      if (!best || songs.length > best.songs.length) best = { plan, songs };
      if (songs.length >= MIN_SHELF_SONGS) break;
    }
    if (!best || best.songs.length === 0) return;
    best.songs.forEach((s) => shownKeys.add(s.key));
    const { scope, country: cc, language: lang } = best.plan;
    shelves.push({ id, scope, country: cc, language: lang, songs: best.songs });
  };

  await place("hot", hotPlans(charts, country, language, now), MIN_HOT_VIEWS);
  // The rooms shelf is for what the charts don't already say.
  await place("rooms", roomPlans(adds, country, language), 0);
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
  const key = `shelves:v3:${country ?? "world"}:${lang ?? "-"}`;
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
