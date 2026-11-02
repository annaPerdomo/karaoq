import {
  ChartFeedError,
  feedChartSource,
  type ChartReport,
  type ChartSong,
  type ChartSource,
} from "./chartFeed";
import {
  GENRE_CHART_IDS,
  GENRES,
  parseGenreChartId,
  storeFor,
} from "./genreCharts";
import { getGenreSnapshotsCollection } from "./mongodb";

// The Top 50 feed has no genre filter; the older iTunes RSS feed still takes one.

export const GENRE_CHART_SIZE = 50;
export const GENRE_REFRESH_HOURS = 44;
/** Two non-mop-up cron runs a night (vercel.json). */
export const GENRE_CHARTS_PER_RUN = Math.ceil(GENRE_CHART_IDS.length / 4) + 2;
export const GENRE_NEW_SONGS_PER_RUN = 100;
/** A genre chart's tail is mostly covers and filler; only its top can add songs. */
export const GENRE_INSERT_TOP = 20;

const UNSINGABLE = /\b(?:instrumental|theme|slowed|sped up|reverb|audio|karaoke)\b/i;
/** Genre charts carry these; left on, they split one song into two corpus rows. */
const VERSION_TAG =
  /\s*[([](?:[^)\]]*\b(?:version|versión|versão|live|ao vivo|en vivo|edit|mix)\b[^)\]]*)[)\]]/gi;

export function cleanGenreTitle(title: string): string {
  return title.replace(VERSION_TAG, "").replace(/\s+/g, " ").trim();
}

export function genreChartUrl(id: string): string {
  const { place, slug } = parseGenreChartId(id);
  const genre = GENRES[slug];
  return `https://itunes.apple.com/${storeFor(place)}/rss/topsongs/limit=${GENRE_CHART_SIZE}/genre=${genre.appleId}/json`;
}

function label(field: unknown): string {
  return String((field as { label?: unknown } | undefined)?.label ?? "");
}

export async function fetchGenreChart(
  id: string,
  fetchImpl: typeof fetch,
  timeoutMs: number
): Promise<ChartSong[]> {
  const resp = await fetchImpl(genreChartUrl(id), { signal: AbortSignal.timeout(timeoutMs) });
  if (!resp.ok) throw new ChartFeedError(`iTunes genre chart ${id} failed`, resp.status);
  const data = await resp.json().catch(() => null);
  const feed = data?.feed;
  if (!feed) throw new ChartFeedError(`iTunes genre chart ${id} returned no feed`);
  // The feed sends a lone entry as an object, and none at all as no key.
  const entries: any[] = Array.isArray(feed.entry) ? feed.entry : feed.entry ? [feed.entry] : [];
  const store = storeFor(parseGenreChartId(id).place);
  return entries
    .map((entry, i) => ({
      artist: label(entry?.["im:artist"]),
      title: label(entry?.["im:name"]),
      country: store,
      rank: i + 1,
    }))
    .filter((row) => !UNSINGABLE.test(row.title))
    .map((row) => ({ ...row, title: cleanGenreTitle(row.title) }));
}

const HOUR_MS = 60 * 60 * 1000;

export const GENRE_CHARTS: ChartSource = {
  ids: GENRE_CHART_IDS,
  statePrefix: "genre:",
  refreshMs: GENRE_REFRESH_HOURS * HOUR_MS,
  perRun: GENRE_CHARTS_PER_RUN,
  newSongsPerRun: GENRE_NEW_SONGS_PER_RUN,
  insertTop: GENRE_INSERT_TOP,
  insertFields: { genreChart: true },
  fetch: fetchGenreChart,
  countryOf: (id) => storeFor(parseGenreChartId(id).place),
  snapshots: getGenreSnapshotsCollection,
};

export function feedGenreCharts(
  deadline: number,
  now: Date = new Date(),
  fetchImpl: typeof fetch = fetch
): Promise<{ done: boolean; report: ChartReport }> {
  return feedChartSource(GENRE_CHARTS, deadline, now, fetchImpl);
}
