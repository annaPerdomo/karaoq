import { GENRES, PLACE_GENRES, genreChartId, storeFor } from "./genreCharts";
import { getGenreSnapshotsCollection, getSuggestionCacheCollection } from "./mongodb";
import {
  MIN_HOT_VIEWS,
  SHELF_REFRESH_MS,
  SHELF_RETRY_MS,
  SHELF_SIZE,
  assembleShelf,
  loadShowable,
  rankChart,
  readTrustedArtists,
} from "./shelves";
import type { GenreShelf } from "./shelfTypes";

export const MIN_GENRE_SONGS = 5;

const QUERY_TIMEOUT_MS = 5000;

export async function computeGenreShelves(place: string, now: Date = new Date()): Promise<GenreShelf[]> {
  const cc = place.toLowerCase();
  const slugs = PLACE_GENRES[cc] ?? [];
  if (slugs.length === 0) return [];

  const snapshots = await getGenreSnapshotsCollection();
  const [snaps, trusted] = await Promise.all([
    snapshots
      .find({ _id: { $in: slugs.map((slug) => genreChartId(cc, slug)) } })
      .maxTimeMS(QUERY_TIMEOUT_MS)
      .toArray(),
    readTrustedArtists(),
  ]);
  const snapOf = new Map(snaps.map((snap) => [snap._id, snap]));

  const charts = slugs.flatMap((slug) => {
    const snap = snapOf.get(genreChartId(cc, slug));
    return snap ? [{ slug, snap, ranked: rankChart(snap, now).slice(0, SHELF_SIZE * 3) }] : [];
  });
  const keys = Array.from(new Set(charts.flatMap((c) => c.ranked.map((r) => r.key))));
  const showable = await loadShowable(keys, trusted);

  const out: GenreShelf[] = [];
  for (const { slug, snap, ranked } of charts) {
    // No skip set: a song can belong to two genres, and each list stands alone.
    const songs = assembleShelf(ranked, new Set(), showable, MIN_HOT_VIEWS);
    if (songs.length < MIN_GENRE_SONGS) continue;
    const genre = GENRES[slug];
    out.push({
      slug,
      name: genre.name,
      emoji: genre.emoji,
      country: cc.toUpperCase(),
      store: storeFor(cc).toUpperCase(),
      songs,
      updatedAt: snap.fetchedAt.toISOString(),
    });
  }
  return out;
}

export function genresFreshFor(genres: GenreShelf[]): number {
  return genres.length > 0 ? SHELF_REFRESH_MS : SHELF_RETRY_MS;
}

export async function getGenreShelves(place: string): Promise<GenreShelf[]> {
  const key = `genres:v1:${place.toUpperCase()}`;
  const cache = await getSuggestionCacheCollection();
  const hit = await cache.findOne({ key });
  if (hit?.genres && Date.now() - hit.computedAt.getTime() < genresFreshFor(hit.genres)) {
    return hit.genres;
  }
  try {
    const genres = await computeGenreShelves(place);
    await cache
      .updateOne({ key }, { $set: { key, genres, computedAt: new Date() } }, { upsert: true })
      .catch(() => {});
    return genres;
  } catch (e) {
    if (hit?.genres) return hit.genres;
    throw e;
  }
}
