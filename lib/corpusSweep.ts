import { getKaraokeVideosCollection } from "./mongodb";
import { dropVideos, refreshVideos, unfileUnprovenCuts } from "./songCorpus";
import { fetchVideoRows, ID_BATCH } from "./youtubeVideos";

// The 30-day rule's enforcement: anything videos.list doesn't return is gone
// from the corpus with it.

/** Read against the corpus it covers: ~900 songs × 12 cuts across the 14 days
 *  between the 16-day cutoff and the 30-day TTL is ~770 rows a day just to keep
 *  level. 2000 clears a full corpus in under a week, for 40 units. */
export const SWEEP_PER_RUN = 2000;

/** Videos are re-read well before their 30-day TTL, so a run that fails or is
 *  skipped has a fortnight of slack before anything expires. */
export const REFRESH_AFTER_DAYS = 16;

export interface SweepReport {
  /** Rows past the cutoff at the start of the run. Climbing past what a run can
   *  check is the corpus outgrowing the sweep. */
  backlog: number;
  checked: number;
  refreshed: number;
  dropped: number;
  cutsPulled: number;
  unpinned: number;
  /** Cuts an add filed on a title YouTube has now contradicted. */
  unproven: number;
  /** YouTube stopped answering, so the unread rows keep their TTL slack. */
  stalled: boolean;
}

export interface SweepOptions {
  limit: number;
  /** Only rows older than this, so a small corpus doesn't re-read itself nightly. */
  staleBefore: Date;
}

/** Oldest refreshedAt first. No cursor: every row the sweep touches moves past
 *  the cutoff, so the same query is the next page. */
export async function sweepCorpusVideos(
  deadline: number,
  opts: SweepOptions
): Promise<{ done: boolean; report: SweepReport }> {
  const report: SweepReport = {
    backlog: 0,
    checked: 0,
    refreshed: 0,
    dropped: 0,
    cutsPulled: 0,
    unpinned: 0,
    unproven: 0,
    stalled: false,
  };
  const key = process.env.YOUTUBE_API_KEY;
  if (!key || Date.now() >= deadline) return { done: false, report };

  const videos = await getKaraokeVideosCollection();
  // Only rows a song names: writeAdd upserts one for every video a room adds,
  // and re-reading those renews the 30 days they exist to expire after.
  const stale = {
    songKeys: { $exists: true, $ne: [] },
    refreshedAt: { $lt: opts.staleBefore },
  };
  report.backlog = await videos.countDocuments(stale);
  const seen = new Set<string>();
  let done = false;

  while (report.checked < opts.limit && Date.now() < deadline) {
    const batch = await videos
      .find(stale, { projection: { _id: 1 } })
      .sort({ refreshedAt: 1 })
      .limit(Math.min(ID_BATCH, opts.limit - report.checked))
      .toArray();
    if (batch.length === 0) {
      done = true;
      break;
    }
    const ids = batch.map((d) => d._id);
    // A batch that comes back unchanged means the refresh isn't landing, and
    // re-reading the same page until the deadline would spend the run on it.
    if (ids.every((id) => seen.has(id))) break;
    for (const id of ids) seen.add(id);

    const live = await fetchVideoRows(ids, key);
    if (!live) {
      report.stalled = true;
      break;
    }
    report.checked += ids.length;
    report.refreshed += await refreshVideos(Array.from(live.values()));

    // After the refresh, so the titles being judged are the ones now stored.
    const unproven = await unfileUnprovenCuts(live);
    report.unproven += unproven.pulled;
    report.unpinned += unproven.unpinned;

    // fetchVideoRows drops missing and unembeddable alike; neither plays.
    const removed = await dropVideos(ids.filter((id) => !live.has(id)));
    report.dropped += removed.dropped;
    report.cutsPulled += removed.cutsPulled;
    report.unpinned += removed.unpinned;
  }

  return { done, report };
}
