import type { AnyBulkWriteOperation, Collection } from "mongodb";

import { firstCreditedArtist } from "./chartCredit";
import { CHART_COUNTRIES } from "./chartCountries";
import { buildSongDeduper } from "./corpusPromote";
import {
  CRON_STATE_TTL_SECONDS,
  getChartSnapshotsCollection,
  getCronStateCollection,
  getKaraokeSongsCollection,
  type ChartRank,
  type ChartSnapshotDoc,
  type KaraokeSongDoc,
} from "./mongodb";
import { songKeyFor } from "./songEntry";

export { CHART_COUNTRIES };
export const CHART_SIZE = 50;
/** Daily, so the hot shelf moves with the charts. Under 24h so a cron slot that
 *  fires a few minutes early still finds yesterday's country due. */
export const CHART_REFRESH_HOURS = 20;
/** Only cron slots 1–2 run this step, so two runs must cover every country;
 *  the +1 lets a slot-1 failure retry without bumping a never-tried one. */
export const CHART_COUNTRIES_PER_RUN = Math.ceil(CHART_COUNTRIES.length / 2) + 1;
export const CHART_NEW_SONGS_PER_RUN = 100;

export interface ChartSong {
  artist: string;
  title: string;
  country: string;
  rank: number;
}

export class ChartFeedError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ChartFeedError";
    this.status = status;
  }
}

export function chartUrl(country: string): string {
  return `https://rss.marketingtools.apple.com/api/v2/${country}/music/most-played/${CHART_SIZE}/songs.json`;
}

const MAX_FETCH_TIMEOUT_MS = 15_000;
const MIN_FETCH_TIMEOUT_MS = 1_000;
const RETRY_PAUSE_MS = 1_500;
const RETRY_TIMEOUT_MS = 8_000;

export async function fetchChart(
  country: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = MAX_FETCH_TIMEOUT_MS
): Promise<ChartSong[]> {
  const resp = await fetchImpl(chartUrl(country), {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) {
    throw new ChartFeedError(`iTunes chart ${country} failed`, resp.status);
  }
  const data = await resp.json().catch(() => null);
  const results = data?.feed?.results;
  if (!Array.isArray(results)) {
    throw new ChartFeedError(`iTunes chart ${country} returned no results`);
  }
  return results.map((row: any, i: number) => ({
    artist: String(row?.artistName ?? ""),
    title: String(row?.name ?? ""),
    country,
    rank: i + 1,
  }));
}

const FEAT_PAREN = /[([]\s*feat\.[^)\]]*[)\]]/gi;
const FROM_FILM = /\(From\s*[“"][^”"]*[”"]\)/gi;
const REMIX_SUFFIX = /\s*\([^)]*\bRemix\)/gi;
const TRAILING_VARIANT = /\s+-\s+(?:Remastered|Live)\b.*$/i;

export function cleanChartTitle(title: string): string {
  return title
    .replace(FEAT_PAREN, "")
    .replace(FROM_FILM, "")
    .replace(REMIX_SUFFIX, "")
    .replace(TRAILING_VARIANT, "")
    .replace(/\s+/g, " ")
    .trim();
}

const FEATURING_SUFFIX = /\s+(?:feat\.|ft\.|featuring)\s.*$/i;

/** The full credit, minus a featured act — kept whole otherwise (an & or a
 *  comma can be the act's own name, e.g. "Earth, Wind & Fire"). */
export function cleanChartArtist(artist: string): string {
  return artist.replace(FEATURING_SUFFIX, "").trim();
}

export { firstCreditedArtist };

export interface ChartReport {
  countries: string[];
  fetched: number;
  added: number;
  alreadyKnown: number;
  errors: { country: string; message: string }[];
}

const HOUR_MS = 60 * 60 * 1000;
const CHART_REFRESH_MS = CHART_REFRESH_HOURS * HOUR_MS;
/** Apple's feed times out and 502s in bursts that clear within minutes, so a
 *  failed country gets the night's second slot rather than waiting a day. */
const FAILED_RETRY_MS = 30 * 60 * 1000;

export interface ChartSource {
  ids: readonly string[];
  statePrefix: string;
  refreshMs: number;
  perRun: number;
  newSongsPerRun: number;
  /** Rows past this rank only rank songs the corpus already holds. */
  insertTop: number;
  insertFields?: Partial<KaraokeSongDoc>;
  fetch: (id: string, fetchImpl: typeof fetch, timeoutMs: number) => Promise<ChartSong[]>;
  countryOf: (id: string) => string;
  snapshots: () => Promise<Collection<ChartSnapshotDoc>>;
}

export const MOST_PLAYED: ChartSource = {
  ids: CHART_COUNTRIES,
  statePrefix: "chart:",
  refreshMs: CHART_REFRESH_MS,
  perRun: CHART_COUNTRIES_PER_RUN,
  newSongsPerRun: CHART_NEW_SONGS_PER_RUN,
  insertTop: Infinity,
  fetch: (cc, fetchImpl, timeoutMs) => fetchChart(cc, fetchImpl, timeoutMs),
  countryOf: (cc) => cc,
  snapshots: getChartSnapshotsCollection,
};

/** Set ahead, as every other cron_state writer does, so the doc survives the
 *  whole refresh window before the TTL (lib/mongodb) takes it. */
function chartExpiryClock(now: Date, refreshMs: number): Date {
  return new Date(now.getTime() + refreshMs - CRON_STATE_TTL_SECONDS * 1000);
}

type SongIdentitySource = Pick<
  KaraokeSongDoc,
  "_id" | "title" | "artist" | "nativeTitle" | "nativeArtist" | "origin"
>;

interface ChartCountryState {
  fetchedAt?: Date;
  failedAt?: Date;
}

/** A country that failed under a day ago sits out rather than re-jumping the queue. */
function dueCountries(
  source: ChartSource,
  stateByCountry: Map<string, ChartCountryState>,
  now: Date
): string[] {
  const staleBefore = new Date(now.getTime() - source.refreshMs);
  const failedWithin = new Date(now.getTime() - FAILED_RETRY_MS);
  const due = source.ids.filter((cc) => {
    const st = stateByCountry.get(cc);
    if (st?.failedAt && st.failedAt > failedWithin) return false;
    return !st?.fetchedAt || st.fetchedAt <= staleBefore;
  });
  // Stable sort: ties keep the source's order `due` already preserves.
  return due
    .slice()
    .sort((a, b) => {
      const ta = stateByCountry.get(a)?.fetchedAt?.getTime() ?? -Infinity;
      const tb = stateByCountry.get(b)?.fetchedAt?.getTime() ?? -Infinity;
      return ta - tb;
    })
    .slice(0, source.perRun);
}

interface CountryWork {
  cc: string;
  ops: AnyBulkWriteOperation<KaraokeSongDoc>[];
  /** False when the run's new-song cap cut its chart short — it stays due. */
  complete: boolean;
  /** Every charted row mapped to its karaoke_songs id, best rank per song. */
  ranks: ChartRank[];
}

/** Carries each song's `since` over from the last snapshot, and keeps the last
 *  snapshot as `prevRanks` unless it is from this same refresh window. */
export function nextSnapshot(
  cc: string,
  ranks: ChartRank[],
  existing: ChartSnapshotDoc | undefined,
  now: Date,
  refreshMs: number = CHART_REFRESH_MS
): ChartSnapshotDoc {
  if (!existing) return { _id: cc, ranks, fetchedAt: now };
  const sinceByKey = new Map(existing.ranks.map((r) => [r.key, r.since]));
  const carried = ranks.map((r) => {
    if (!sinceByKey.has(r.key)) return { ...r, since: now };
    const since = sinceByKey.get(r.key);
    return since ? { ...r, since } : { key: r.key, rank: r.rank };
  });
  const rollOver = existing.fetchedAt.getTime() <= now.getTime() - refreshMs;
  const prev = rollOver
    ? { prevRanks: existing.ranks, prevFetchedAt: existing.fetchedAt }
    : existing.prevRanks && existing.prevFetchedAt
      ? { prevRanks: existing.prevRanks, prevFetchedAt: existing.prevFetchedAt }
      : {};
  return { _id: cc, ranks: carried, fetchedAt: now, ...prev };
}

export async function feedCharts(
  deadline: number,
  now: Date = new Date(),
  fetchImpl: typeof fetch = fetch
): Promise<{ done: boolean; report: ChartReport }> {
  return feedChartSource(MOST_PLAYED, deadline, now, fetchImpl);
}

export async function feedChartSource(
  source: ChartSource,
  deadline: number,
  now: Date = new Date(),
  fetchImpl: typeof fetch = fetch
): Promise<{ done: boolean; report: ChartReport }> {
  const report: ChartReport = {
    countries: [],
    fetched: 0,
    added: 0,
    alreadyKnown: 0,
    errors: [],
  };
  if (Date.now() >= deadline) return { done: false, report };

  const state = await getCronStateCollection();
  const stateDocs = await state
    .find({ _id: { $in: source.ids.map((cc) => source.statePrefix + cc) } })
    .toArray();
  const stateByCountry = new Map<string, ChartCountryState>(
    stateDocs.map((doc) => [
      doc._id.slice(source.statePrefix.length),
      { fetchedAt: doc.fetchedAt, failedAt: doc.failedAt },
    ])
  );
  const countries = dueCountries(source, stateByCountry, now);

  const songs = await getKaraokeSongsCollection();
  const identities: SongIdentitySource[] = await songs
    .find({}, { projection: { title: 1, artist: 1, nativeTitle: 1, nativeArtist: 1, origin: 1 } })
    .toArray();
  const deduper = buildSongDeduper(identities);
  const originById = new Map(identities.map((song) => [song._id, song.origin]));
  // A song inserted earlier in this run: later countries append here directly
  // rather than queuing a second op against an id the insert op hasn't landed
  // yet (two unordered ops on one new _id would race in real Mongo).
  const pendingChartCountries = new Map<string, string[]>();

  const work: CountryWork[] = [];
  let stoppedEarly = false;

  for (const cc of countries) {
    if (report.added >= source.newSongsPerRun) break;

    const timeoutMs = Math.min(MAX_FETCH_TIMEOUT_MS, deadline - Date.now());
    if (timeoutMs < MIN_FETCH_TIMEOUT_MS) {
      stoppedEarly = true;
      break;
    }

    report.countries.push(cc);
    let chart: ChartSong[];
    try {
      chart = await source.fetch(cc, fetchImpl, timeoutMs).catch(async (first) => {
        // Apple's feed fails in bursts that usually clear within a second or
        // two; one more try saves the country a wait for the next slot.
        const retryMs = Math.min(RETRY_TIMEOUT_MS, deadline - Date.now() - RETRY_PAUSE_MS);
        if (retryMs < MIN_FETCH_TIMEOUT_MS) throw first;
        await new Promise((resolve) => setTimeout(resolve, RETRY_PAUSE_MS));
        return source.fetch(cc, fetchImpl, retryMs);
      });
    } catch (e: any) {
      report.errors.push({ country: cc, message: e?.message ?? "fetch failed" });
      await state
        .updateOne(
          { _id: source.statePrefix + cc },
          { $set: { failedAt: now, cursorAt: chartExpiryClock(now, source.refreshMs), updatedAt: now } },
          { upsert: true }
        )
        .catch((err: any) => console.warn("Chart feed failure stamp failed:", err?.message));
      continue;
    }
    report.fetched += 1;

    const ops: AnyBulkWriteOperation<KaraokeSongDoc>[] = [];
    const ranks: ChartRank[] = [];
    const ranked = new Set<string>();
    const rankAs = (key: string, rank: number) => {
      if (ranked.has(key)) return;
      ranked.add(key);
      ranks.push({ key, rank });
    };
    const store = source.countryOf(cc);
    let complete = true;
    for (const row of chart) {
      if (report.added >= source.newSongsPerRun) {
        complete = false;
        break;
      }
      const artist = cleanChartArtist(row.artist);
      const title = cleanChartTitle(row.title);
      if (!artist || !title) continue;

      const firstCredited = firstCreditedArtist(artist);
      const match =
        deduper.find(artist, title) ??
        (firstCredited !== artist ? deduper.find(firstCredited, title) : null);
      if (match) {
        report.alreadyKnown += 1;
        rankAs(match, row.rank);
        const pending = pendingChartCountries.get(match);
        if (pending) {
          if (pending.indexOf(store) < 0) pending.push(store);
        } else if (originById.get(match) === "chart") {
          ops.push({
            updateOne: {
              filter: { _id: match },
              update: {
                $addToSet: { chartCountries: store },
                // A Top 50 hit is no longer just a genre chart's.
                ...(source.insertFields ? {} : { $unset: { genreChart: "" } }),
              },
            },
          });
        }
        continue;
      }

      if (row.rank > source.insertTop) continue;
      const key = songKeyFor(artist, title);
      rankAs(key, row.rank);
      const chartCountries = [store];
      deduper.add({ _id: key, title, artist, origin: "chart" });
      originById.set(key, "chart");
      pendingChartCountries.set(key, chartCountries);
      ops.push({
        updateOne: {
          filter: { _id: key },
          update: {
            // $setOnInsert only: a race inserting the same song twice must not
            // clobber cuts claim or resolve have already started filling.
            $setOnInsert: {
              title,
              artist,
              cuts: [],
              addCount: 0,
              addsByCountry: {},
              demand: 0,
              origin: "chart",
              chartCountries,
              promotedAt: now,
              ...source.insertFields,
            },
          },
          upsert: true,
        },
      });
      report.added += 1;
    }

    work.push({ cc, ops, complete, ranks });
  }

  const allOps = work.flatMap((w) => w.ops);
  let written = true;
  if (allOps.length > 0) {
    try {
      await songs.bulkWrite(allOps, { ordered: false });
    } catch (e: any) {
      written = false;
      console.warn("Chart feed song write failed:", e?.message);
    }
  }

  // A country cut short by the cap, or whose write didn't land, stays due.
  if (written) {
    const snapshots = await source.snapshots();
    // Unreadable is not absent: writing over it would reset every song's
    // `since` and drop prevRanks, so a failed read skips the snapshots instead.
    const existing = await snapshots
      .find({ _id: { $in: work.map((w) => w.cc) } })
      .toArray()
      .then((docs) => new Map(docs.map((doc) => [doc._id, doc])))
      .catch((e: any) => {
        console.warn("Chart snapshot read failed:", e?.message);
        return null;
      });
    for (const w of work) {
      if (!w.complete) continue;
      if (existing) {
        await snapshots
          .replaceOne(
            { _id: w.cc },
            nextSnapshot(w.cc, w.ranks, existing.get(w.cc), now, source.refreshMs),
            { upsert: true }
          )
          .catch((e: any) => console.warn("Chart snapshot write failed:", e?.message));
      }
      await state
        .updateOne(
          { _id: source.statePrefix + w.cc },
          {
            $set: { fetchedAt: now, cursorAt: chartExpiryClock(now, source.refreshMs), updatedAt: now },
            $unset: { failedAt: "" },
          },
          { upsert: true }
        )
        .catch((e: any) => console.warn("Chart feed fetch stamp failed:", e?.message));
    }
  }

  return { done: !stoppedEarly, report };
}
