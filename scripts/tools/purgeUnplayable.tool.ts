import { describe, it, expect } from "vitest";
import { writeFileSync } from "fs";
import { loadLocalEnv } from "./env";

// Sweeps the whole corpus in one go, where the nightly cron only reaches rows
// 16+ days stale. ~1 videos.list unit per 50 rows, a few hundred for the lot.
//
// Only once the playability branch is live on prod — before that the resolver
// buys the purged videos straight back. It also lands the corpus on a single
// refreshedAt, so the nightly 2000-row sweep must cover it — 28k — before the TTL.
//
//   PURGE_LIVE=1 pnpm tool scripts/tools/purgeUnplayable.tool.ts
const LIVE = Boolean(process.env.PURGE_LIVE);

import { sweepCorpusVideos } from "../../lib/corpusSweep";
import {
  getKaraokeSongsCollection,
  getKaraokeVideosCollection,
} from "../../lib/mongodb";

const COUNTERS = [
  "checked",
  "pending",
  "refreshed",
  "dropped",
  "blocked",
  "cutsPulled",
  "unpinned",
  "unproven",
  "cachePruned",
] as const;
type Counter = (typeof COUNTERS)[number];

function envCount(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Only rows a song names: the sweep leaves search evidence alone, so that is
 *  the count the dropped total has to square with. */
async function counts(): Promise<{
  videos: number;
  named: number;
  withCuts: number;
}> {
  const videos = await getKaraokeVideosCollection();
  const songs = await getKaraokeSongsCollection();
  return {
    videos: await videos.countDocuments({}),
    named: await videos.countDocuments({ songKeys: { $exists: true, $ne: [] } }),
    withCuts: await songs.countDocuments({ "cuts.0": { $exists: true } }),
  };
}

const col = (v: string | number): string => String(v).padStart(9);
const row = (iter: string | number, cells: Array<string | number>): string =>
  String(iter).padStart(5) + cells.map(col).join("");

describe("purge unplayable corpus videos", () => {
  it.runIf(LIVE)("sweeps the whole corpus, not just the stale tail", async () => {
    loadLocalEnv();
    const before = await counts();

    // Once, before the loop: the sweep stamps a fresh refreshedAt on every row
    // it keeps, so a moving cutoff would re-admit them and never converge.
    const staleBefore = new Date();
    const batch = envCount("PURGE_BATCH", 5000);
    // Short of the test timeout by an iteration and its cache prune: a corpus
    // too big for one run has to end by printing the report, not by vitest.
    const runUntil = Date.now() + 600_000;

    const totals = {} as Record<Counter, number>;
    for (const k of COUNTERS) totals[k] = 0;

    const lines = [
      row("iter", [
        "backlog",
        "checked",
        "refreshed",
        "dropped",
        "blocked",
        "cuts",
        "unpinned",
        "unproven",
        "cache",
      ]),
    ];
    let iterations = 0;
    let startBacklog = 0;
    let lastBacklog = -1;
    let stalls = 0;
    let done = false;
    let failure = "";

    while (!done && Date.now() < runUntil) {
      const swept = await sweepCorpusVideos(Date.now() + 120_000, {
        limit: batch,
        staleBefore,
        // The nightly bound saves budget for retention; this run wants all of it.
        pendingLimit: batch,
      });
      const report = swept.report;
      done = swept.done;
      iterations += 1;
      if (iterations === 1) startBacklog = report.backlog;
      for (const k of COUNTERS) totals[k] += report[k];

      const line = row(iterations, [
        report.backlog,
        report.checked,
        report.refreshed,
        report.dropped,
        report.blocked,
        report.cutsPulled,
        report.unpinned,
        report.unproven,
        report.cachePruned,
      ]);
      lines.push(line);
      console.log(line);

      // A single timed-out videos.list must not cost the run; three iterations
      // running is YouTube down, and the retry restarts the backlog check.
      if (report.stalled) {
        stalls += 1;
        if (stalls >= 3) {
          failure = "the YouTube API stalled three iterations running";
          break;
        }
        lastBacklog = -1;
        await new Promise((r) => setTimeout(r, 5_000));
        continue;
      }
      stalls = 0;

      if (!done && report.checked === 0) {
        failure = "an unfinished iteration checked no rows — YOUTUBE_API_KEY?";
      } else if (!done && lastBacklog >= 0 && report.backlog >= lastBacklog) {
        failure = `the backlog stopped shrinking at ${report.backlog} rows`;
      }
      if (failure) break;
      lastBacklog = report.backlog;
    }

    const after = await counts();
    lines.push(
      "",
      `iterations          : ${iterations}`,
      `stale rows at start : ${startBacklog}`,
      `videos checked      : ${totals.checked}`,
      `  never named yet   : ${totals.pending}`,
      `videos refreshed    : ${totals.refreshed}`,
      `videos dropped      : ${totals.dropped}`,
      `  of them tombstoned: ${totals.blocked}`,
      `cuts pulled         : ${totals.cutsPulled}`,
      `songs unpinned      : ${totals.unpinned}`,
      `unproven cuts pulled: ${totals.unproven}`,
      `cache rows pruned   : ${totals.cachePruned}`,
      `videos stored       : ${before.videos} -> ${after.videos}`,
      `  named by a song   : ${before.named} -> ${after.named}`,
      `songs with cuts     : ${before.withCuts} -> ${after.withCuts}`,
      `swept to the end    : ${done}`
    );
    const text = lines.join("\n");
    writeFileSync("/tmp/purge-unplayable.txt", text);
    console.log(text);

    if (failure) throw new Error(`Purge aborted: ${failure}`);
    expect(done).toBe(true);
  }, 900_000);
});
