import type { AnyBulkWriteOperation } from "mongodb";

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

export const CHART_COUNTRIES = [
  "us", "gb", "ph", "de", "es", "mx", "tw", "my",
  "nz", "au", "ca", "fr", "it", "br", "id", "jp",
  "kr", "in", "cz", "co", "ar", "cl", "pe", "pt",
] as const;
export const CHART_SIZE = 50;
/** Daily, so the hot shelf moves with the charts. Under 24h so a cron slot that
 *  fires a few minutes early still finds yesterday's country due. */
export const CHART_REFRESH_HOURS = 20;
/** Only the first two cron slots run this step (the mop-up slots run resolve
 *  alone), so two runs must cover every country. */
export const CHART_COUNTRIES_PER_RUN = Math.ceil(CHART_COUNTRIES.length / 2);
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

const FIRST_CREDIT_SEPARATOR = /\s&\s|,\s|\sx\s/i;

/** Only for matching against a pack entry keyed on one name — never what gets
 *  inserted. Exported for corpusPromote's evidence scoring, which credits the
 *  same first-named act. */
export function firstCreditedArtist(artist: string): string {
  return artist.split(FIRST_CREDIT_SEPARATOR)[0].trim();
}

export interface ChartReport {
  countries: string[];
  fetched: number;
  added: number;
  alreadyKnown: number;
  errors: { country: string; message: string }[];
}

const CHART_STATE_PREFIX = "chart:";
const HOUR_MS = 60 * 60 * 1000;
const CHART_REFRESH_MS = CHART_REFRESH_HOURS * HOUR_MS;
/** Apple's feed times out and 502s in bursts that clear within minutes, so a
 *  failed country gets the night's second slot rather than waiting a day. */
const FAILED_RETRY_MS = 30 * 60 * 1000;

/** Set ahead, as every other cron_state writer does, so the doc survives the
 *  whole refresh window before the TTL (lib/mongodb) takes it. */
function chartExpiryClock(now: Date): Date {
  return new Date(now.getTime() + CHART_REFRESH_MS - CRON_STATE_TTL_SECONDS * 1000);
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
function dueCountries(stateByCountry: Map<string, ChartCountryState>, now: Date): string[] {
  const staleBefore = new Date(now.getTime() - CHART_REFRESH_MS);
  const failedWithin = new Date(now.getTime() - FAILED_RETRY_MS);
  const due = CHART_COUNTRIES.filter((cc) => {
    const st = stateByCountry.get(cc);
    if (st?.failedAt && st.failedAt > failedWithin) return false;
    return !st?.fetchedAt || st.fetchedAt <= staleBefore;
  });
  // Stable sort: ties keep the CHART_COUNTRIES order `due` already preserves.
  return due
    .slice()
    .sort((a, b) => {
      const ta = stateByCountry.get(a)?.fetchedAt?.getTime() ?? -Infinity;
      const tb = stateByCountry.get(b)?.fetchedAt?.getTime() ?? -Infinity;
      return ta - tb;
    })
    .slice(0, CHART_COUNTRIES_PER_RUN);
}

interface CountryWork {
  cc: string;
  ops: AnyBulkWriteOperation<KaraokeSongDoc>[];
  /** False when CHART_NEW_SONGS_PER_RUN cut its chart short — it stays due. */
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
  now: Date
): ChartSnapshotDoc {
  if (!existing) return { _id: cc, ranks, fetchedAt: now };
  const sinceByKey = new Map(existing.ranks.map((r) => [r.key, r.since]));
  const carried = ranks.map((r) => {
    if (!sinceByKey.has(r.key)) return { ...r, since: now };
    const since = sinceByKey.get(r.key);
    return since ? { ...r, since } : { key: r.key, rank: r.rank };
  });
  const rollOver = existing.fetchedAt.getTime() <= now.getTime() - CHART_REFRESH_MS;
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
    .find({ _id: { $in: CHART_COUNTRIES.map((cc) => CHART_STATE_PREFIX + cc) } })
    .toArray();
  const stateByCountry = new Map<string, ChartCountryState>(
    stateDocs.map((doc) => [
      doc._id.slice(CHART_STATE_PREFIX.length),
      { fetchedAt: doc.fetchedAt, failedAt: doc.failedAt },
    ])
  );
  const countries = dueCountries(stateByCountry, now);

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
    if (report.added >= CHART_NEW_SONGS_PER_RUN) break;

    const timeoutMs = Math.min(MAX_FETCH_TIMEOUT_MS, deadline - Date.now());
    if (timeoutMs < MIN_FETCH_TIMEOUT_MS) {
      stoppedEarly = true;
      break;
    }

    report.countries.push(cc);
    let chart: ChartSong[];
    try {
      chart = await fetchChart(cc, fetchImpl, timeoutMs).catch(async (first) => {
        // Apple's feed fails in bursts that usually clear within a second or
        // two; one more try saves the country a wait for the next slot.
        const retryMs = Math.min(RETRY_TIMEOUT_MS, deadline - Date.now() - RETRY_PAUSE_MS);
        if (retryMs < MIN_FETCH_TIMEOUT_MS) throw first;
        await new Promise((resolve) => setTimeout(resolve, RETRY_PAUSE_MS));
        return fetchChart(cc, fetchImpl, retryMs);
      });
    } catch (e: any) {
      report.errors.push({ country: cc, message: e?.message ?? "fetch failed" });
      await state
        .updateOne(
          { _id: CHART_STATE_PREFIX + cc },
          { $set: { failedAt: now, cursorAt: chartExpiryClock(now), updatedAt: now } },
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
    let complete = true;
    for (const row of chart) {
      if (report.added >= CHART_NEW_SONGS_PER_RUN) {
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
          if (pending.indexOf(cc) < 0) pending.push(cc);
        } else if (originById.get(match) === "chart") {
          ops.push({
            updateOne: { filter: { _id: match }, update: { $addToSet: { chartCountries: cc } } },
          });
        }
        continue;
      }

      const key = songKeyFor(artist, title);
      rankAs(key, row.rank);
      const chartCountries = [cc];
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
    const snapshots = await getChartSnapshotsCollection();
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
          .replaceOne({ _id: w.cc }, nextSnapshot(w.cc, w.ranks, existing.get(w.cc), now), {
            upsert: true,
          })
          .catch((e: any) => console.warn("Chart snapshot write failed:", e?.message));
      }
      await state
        .updateOne(
          { _id: CHART_STATE_PREFIX + w.cc },
          {
            $set: { fetchedAt: now, cursorAt: chartExpiryClock(now), updatedAt: now },
            $unset: { failedAt: "" },
          },
          { upsert: true }
        )
        .catch((e: any) => console.warn("Chart feed fetch stamp failed:", e?.message));
    }
  }

  return { done: !stoppedEarly, report };
}
