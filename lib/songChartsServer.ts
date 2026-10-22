// DB-touching half of the song-chart pages, split from songCharts.ts (mirrors
// lib/publicStats vs publicStatsServer) so the Mongo driver never reaches the
// browser bundle.

import { CHART_COUNTRIES } from './chartFeed';
import { getKaraokeSongsCollection, getKaraokeVideosCollection } from './mongodb';
import { CHART_LIMIT, CHART_MIN_SONGS, type ChartSong } from './songCharts';

// Re-exported, not copied, so these pages' country list can't drift from the
// chart feed's own.
export const SONG_CHART_COUNTRIES: readonly string[] = CHART_COUNTRIES;

const CANDIDATE_MULTIPLIER = 3;
const QUERY_TIMEOUT_MS = 5000;

function isServable(row?: { thumbnailUrl?: string }): boolean {
  return !!row?.thumbnailUrl;
}

export async function readTopSongs(opts: {
  country?: string;
  limit?: number;
}): Promise<ChartSong[]> {
  const limit = opts.limit ?? CHART_LIMIT;
  const countField = opts.country
    ? `addsByCountry.${opts.country.toUpperCase()}`
    : 'addCount';

  const songs = await getKaraokeSongsCollection();
  const candidates = await songs
    .find(
      {
        retired: { $ne: true },
        'cuts.0': { $exists: true },
        $or: [{ 'packIds.0': { $exists: true } }, { origin: 'chart' }],
        [countField]: { $gt: 0 },
      },
      { projection: { title: 1, artist: 1, cuts: 1 } }
    )
    .sort({ [countField]: -1, title: 1 })
    .limit(limit * CANDIDATE_MULTIPLIER)
    .maxTimeMS(QUERY_TIMEOUT_MS)
    .toArray();
  if (candidates.length === 0) return [];

  const cutIds = Array.from(new Set(candidates.flatMap((c) => c.cuts ?? [])));
  const videos = await getKaraokeVideosCollection();
  const servedRows =
    cutIds.length > 0
      ? await videos
          .find({ _id: { $in: cutIds } }, { projection: { thumbnailUrl: 1 } })
          .maxTimeMS(QUERY_TIMEOUT_MS)
          .toArray()
      : [];
  const served = new Set(servedRows.filter((r) => isServable(r)).map((r) => r._id));

  const seen = new Set<string>();
  const out: ChartSong[] = [];
  for (const candidate of candidates) {
    if (out.length >= limit) break;
    if (!(candidate.cuts ?? []).some((id) => served.has(id))) continue;
    const key = `${candidate.title.toLowerCase()}::${candidate.artist.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title: candidate.title, artist: candidate.artist });
  }
  return out;
}

export interface CountriesWithChartsResult {
  countries: string[];
  /** False if any country's read failed — the caller should retry sooner. */
  allOk: boolean;
}

/**
 * SONG_CHART_COUNTRIES that clear CHART_MIN_SONGS, via the exact call
 * pages/songs/[country].tsx's own getStaticProps makes per country.
 */
export async function countriesWithCharts(): Promise<CountriesWithChartsResult> {
  const results = await Promise.allSettled(
    CHART_COUNTRIES.map(async (cc) => {
      const songs = await readTopSongs({ country: cc });
      return songs.length >= CHART_MIN_SONGS ? cc : null;
    })
  );
  const countries: string[] = [];
  let allOk = true;
  for (const result of results) {
    if (result.status === 'fulfilled') {
      if (result.value) countries.push(result.value);
    } else {
      allOk = false;
    }
  }
  return { countries, allOk };
}
