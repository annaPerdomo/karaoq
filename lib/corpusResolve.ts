import type { Filter } from "mongodb";

import { getKaraokeSongsCollection, type KaraokeSongDoc } from "./mongodb";
import { buildSearchQuery } from "./searchQuery";
import { markResolveMiss, recordSearchResults, THIN_CUTS } from "./songCorpus";
import { CATALOG_DURATION, CATALOG_SORT } from "./suggestionCatalog";
import { YoutubeApiError } from "./youtubeApi";
import { searchYoutubeApi } from "./youtubeSearch";

// The only place in the product that spends a search.list call on anything but
// a query a singer typed. YouTube allows 100 a day project-wide, so the budget
// is a daily one (lib/corpusBudget) and this step runs last.

export interface ResolveStepReport {
  /** The whole wanted list, not the page of it this run could afford. */
  wanted: number;
  /** Of those, the ones not backing off from an earlier empty answer. */
  eligible: number;
  searched: number;
  filled: number;
  /** Searches that answered with nothing new, each buying its song a wait. */
  missed: number;
  thin: number;
  widened: number;
  quotaSpent: boolean;
}

/** A song's _id is searchCacheKey() of exactly this query, so rebuilding it is
 *  what files the answer under the song it asked for. */
function songQuery(song: KaraokeSongDoc): string {
  const title = song.nativeTitle ?? song.title;
  const artist = song.nativeArtist ?? song.artist;
  return buildSearchQuery(`${artist} ${title}`.trim(), true);
}

/** Absent is eligible, so no backfill onto songs seeded before the field. */
function eligibleNow(now: Date): Filter<KaraokeSongDoc> {
  return {
    $or: [{ nextResolveAt: { $exists: false } }, { nextResolveAt: { $lte: now } }],
  };
}

interface PassResult {
  calls: number;
  filled: number;
  missed: number;
  quotaSpent: boolean;
}

async function searchInto(
  wanted: KaraokeSongDoc[],
  budget: number,
  deadline: number,
  attempted: Set<string>
): Promise<PassResult> {
  const pass: PassResult = { calls: 0, filled: 0, missed: 0, quotaSpent: false };
  for (const song of wanted) {
    if (pass.calls >= budget || Date.now() >= deadline) break;
    attempted.add(song._id);
    pass.calls += 1;
    try {
      const results = await searchYoutubeApi(
        songQuery(song),
        CATALOG_DURATION,
        CATALOG_SORT
      );
      const written =
        results.length > 0
          ? await recordSearchResults(song._id, results)
          : { cutsAdded: 0 };
      if (written.cutsAdded > 0) {
        pass.filled += 1;
        continue;
      }
      // No answer, or one the song already held: the call bought nothing, and
      // the miss is what stops it being bought again ahead of untried songs.
      pass.missed += 1;
      await markResolveMiss(song._id);
    } catch (e: any) {
      // Only a spent quota ends the step: a timeout must not forfeit a day of
      // corpus progress that can't be earned back. Nor does it count as a miss,
      // or our own flakiness backs a song off for a fortnight.
      if (e instanceof YoutubeApiError && e.quotaExceeded) {
        console.warn("Corpus resolve stopped, quota spent:", e?.message);
        pass.quotaSpent = true;
        break;
      }
      console.warn("Corpus resolve skipped", song._id, e?.message);
    }
  }
  return pass;
}

export async function resolveWantedSongs(
  deadline: number,
  budget: number
): Promise<{ done: boolean; report: ResolveStepReport }> {
  const report: ResolveStepReport = {
    wanted: 0,
    eligible: 0,
    searched: 0,
    filled: 0,
    missed: 0,
    thin: 0,
    widened: 0,
    quotaSpent: false,
  };
  if (budget <= 0 || Date.now() >= deadline) return { done: false, report };

  const songs = await getKaraokeSongsCollection();
  const now = new Date();
  const ready = eligibleNow(now);
  report.wanted = await songs.countDocuments({ cuts: [] });
  const wanted = await songs
    .find({ cuts: [], ...ready })
    .sort({ demand: -1 })
    .limit(budget)
    .toArray();
  report.eligible = wanted.length;

  const attempted = new Set<string>();
  const first = await searchInto(wanted, budget, deadline, attempted);
  report.searched = first.calls;
  report.filled = first.filled;
  report.missed = first.missed;
  report.quotaSpent = first.quotaSpent;

  const remaining = budget - first.calls;
  if (!first.quotaSpent && remaining > 0 && Date.now() < deadline) {
    // A search not spent today is lost for good, so what's left widens thin
    // songs. Holding any cut at all is what keeps one off the wanted list.
    const thin = (
      await songs
        .find({ $expr: { $lt: [{ $size: "$cuts" }, THIN_CUTS] }, ...ready })
        .sort({ demand: -1 })
        // Room for the ones this run already tried and is about to filter out.
        .limit(remaining + attempted.size)
        .toArray()
    ).filter((song) => !attempted.has(song._id));
    report.thin = thin.length;

    const second = await searchInto(thin, remaining, deadline, attempted);
    report.widened = second.calls;
    report.filled += second.filled;
    report.missed += second.missed;
    report.quotaSpent = second.quotaSpent;
  }

  const done =
    !report.quotaSpent &&
    Date.now() < deadline &&
    report.searched + report.widened < budget;
  return { done, report };
}
