import type { Filter } from "mongodb";

import { getKaraokeVideosCollection, type KaraokeVideoDoc } from "./mongodb";
import { pruneCachedVideos } from "./searchCache";
import { dropVideos, refreshVideos, unfileUnprovenCuts } from "./songCorpus";
import { fetchVideoRows, ID_BATCH } from "./youtubeVideos";

/** ~900 songs × 12 cuts over the 14 days between cutoff and TTL is ~770 rows a
 *  day to keep level; 2000 clears a full corpus in a week, for 40 units. */
export const SWEEP_PER_RUN = 2000;

/** Well inside the 30-day TTL: a failed or skipped run has a fortnight of slack. */
export const REFRESH_AFTER_DAYS = 16;

/** Bounded: a night of adds must not spend the run before the retention pass. */
export const UNPROVEN_PER_RUN = 200;

export interface SweepReport {
  backlog: number;
  checked: number;
  /** Of those, rows no videos.list call had named yet. */
  pending: number;
  refreshed: number;
  dropped: number;
  cutsPulled: number;
  unpinned: number;
  /** Cuts an add filed on a title YouTube has now contradicted. */
  unproven: number;
  cachePruned: number;
  stalled: boolean;
}

export interface SweepOptions {
  limit: number;
  staleBefore: Date;
  pendingLimit?: number;
}

/** "drained" — no more rows — is the only outcome that means caught up. */
type PageResult = "swept" | "drained" | "stopped";

/** Oldest refreshedAt first, unnamed rows before stale ones. No cursor: every row
 *  the sweep touches leaves its query, so the same query is the next page. */
export async function sweepCorpusVideos(
  deadline: number,
  opts: SweepOptions
): Promise<{ done: boolean; report: SweepReport }> {
  const report: SweepReport = {
    backlog: 0,
    checked: 0,
    pending: 0,
    refreshed: 0,
    dropped: 0,
    cutsPulled: 0,
    unpinned: 0,
    unproven: 0,
    cachePruned: 0,
    stalled: false,
  };
  const key = process.env.YOUTUBE_API_KEY;
  if (!key || Date.now() >= deadline) return { done: false, report };
  const apiKey = key;

  const videos = await getKaraokeVideosCollection();
  const seen = new Set<string>();
  const gone: string[] = [];

  async function sweepPage(
    filter: Filter<KaraokeVideoDoc>,
    limit: number
  ): Promise<PageResult> {
    const batch = await videos
      .find(filter, { projection: { _id: 1 } })
      .sort({ refreshedAt: 1 })
      .limit(Math.min(ID_BATCH, limit))
      .toArray();
    if (batch.length === 0) return "drained";
    const ids = batch.map((d) => d._id);
    if (ids.every((id) => seen.has(id))) return "stopped";
    for (const id of ids) seen.add(id);

    const live = await fetchVideoRows(ids, apiKey);
    if (!live) {
      report.stalled = true;
      return "stopped";
    }
    report.checked += ids.length;
    report.refreshed += await refreshVideos(Array.from(live.values()));

    // After the refresh, so the titles being judged are the ones now stored.
    const unproven = await unfileUnprovenCuts(live);
    report.unproven += unproven.pulled;
    report.unpinned += unproven.unpinned;

    // fetchVideoRows drops missing and unembeddable alike; neither plays.
    const dead = ids.filter((id) => !live.has(id));
    const removed = await dropVideos(dead);
    report.dropped += removed.dropped;
    report.cutsPulled += removed.cutsPulled;
    report.unpinned += removed.unpinned;
    for (const id of dead) gone.push(id);
    return "swept";
  }

  // Only rows a song names: re-reading a stray add renews its 30 days.
  const named = { songKeys: { $exists: true, $ne: [] } };
  const stale = { ...named, refreshedAt: { $lt: opts.staleBefore } };
  report.backlog = await videos.countDocuments(stale);

  // Ahead of the retention pass: until videos.list names it, an add's row serves
  // nothing (lib/corpusRead) and a crafted pairing stays filed uncontradicted.
  const pendingBudget = Math.min(opts.pendingLimit ?? UNPROVEN_PER_RUN, opts.limit);
  while (report.checked < pendingBudget && Date.now() < deadline) {
    const swept = await sweepPage(
      { ...named, thumbnailUrl: "" },
      pendingBudget - report.checked
    );
    if (swept !== "swept") break;
  }
  report.pending = report.checked;

  let done = false;
  while (report.checked < opts.limit && !report.stalled && Date.now() < deadline) {
    const swept = await sweepPage(stale, opts.limit - report.checked);
    if (swept === "drained") {
      done = true;
      break;
    }
    if (swept === "stopped") break;
  }

  // A search's results are served fresh for a fortnight (pages/api/search), so a
  // dead video would otherwise be offered for two weeks after the corpus drops it.
  report.cachePruned = await pruneCachedVideos(gone);

  return { done, report };
}
