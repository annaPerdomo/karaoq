import { NextApiRequest, NextApiResponse } from "next";
import {
  acquireRun,
  CHANNEL_PAGES_PER_DAY,
  recordSpend,
  releaseRun,
  remaining,
  SEARCH_PER_DAY,
  spentToday,
  type DailySpend,
} from "../../../lib/corpusBudget";
import {
  CHANNEL_PAGES_PER_CHANNEL,
  CHANNEL_RESWEEP_MS,
  CUTS_PER_SONG,
  harvestIntoCorpus,
} from "../../../lib/corpusHarvest";
import { migrateToCorpus } from "../../../lib/corpusMigration";
import { publishCorpus } from "../../../lib/corpusPublish";
import { resolveWantedSongs } from "../../../lib/corpusResolve";
import {
  REFRESH_AFTER_DAYS,
  SWEEP_PER_RUN,
  sweepCorpusVideos,
} from "../../../lib/corpusSweep";
import { suggestionCatalog } from "../../../lib/suggestionCatalog";

// Nightly, not monthly: the quota is a daily allowance, so a monthly pass could
// only ever spend one day's worth. vercel.json invokes this twice because a full
// harvest outlasts the 300s function — the later slot buys clock, not quota
// (lib/corpusBudget).

// The function's ceiling, with the run's deadline held under it: stopping
// voluntarily keeps what a run paid for, where being killed mid-step spent the
// units and wrote nothing.
export const config = { maxDuration: 300 };
const RUN_BUDGET_MS = 240_000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** No step may assume it finishes: the contract is to stop starting work at the
 *  deadline, persist the cursor, and hand back done:false to be resumed.
 *  `spent` is what it took out of the day's YouTube allowance. */
type Step = (deadline: number) => Promise<{
  done: boolean;
  report: Record<string, unknown>;
  spent?: Partial<DailySpend>;
}>;

interface StepSpec {
  name: string;
  run: Step;
  /** The longest this step may hold the run, whatever else is left. */
  budgetMs: number;
  /** Held back out of the run for the steps after this one: handed the whole
   *  deadline, the harvest legitimately takes it and search opens on nothing. */
  floorMs: number;
}

function envCount(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Closed rather than open when unset, so a missing env var can't publish a
  // route that spends the API quota.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ code: 401, message: "Unauthorized." });
    return;
  }

  // ?search=0 runs only the steps that don't touch search.list. Everything
  // else still does real work, so a maxed-out day isn't a no-op.
  const useSearch = req.query.search !== "0";
  // Nothing branches on it; it is what makes the second cron entry a distinct
  // path, and what names a run in the logs.
  const slot = typeof req.query.slot === "string" ? req.query.slot : "1";

  const started = Date.now();
  const deadline = started + RUN_BUDGET_MS;

  if (!(await acquireRun(started))) {
    console.log("Corpus cron skipped, a run holds the lease:", slot);
    res.status(200).json({ skipped: "locked", slot });
    return;
  }

  const spent = await spentToday(started);
  const searchBudget = remaining(
    envCount("SUGGESTION_RESOLVE_PER_DAY", SEARCH_PER_DAY),
    spent.searches
  );
  const pageBudget = remaining(
    envCount("SUGGESTION_CHANNEL_PAGES", CHANNEL_PAGES_PER_DAY),
    spent.pages
  );

  /** Cheap and user-visible first, so a run short of clock has spent it where a
   *  browsing room can feel it. Search is last: it's the one a room competes
   *  with for quota. */
  const steps: StepSpec[] = [
    {
      name: "migrate",
      budgetMs: 60_000,
      floorMs: 0,
      run: async (by) => {
        const { done, report } = await migrateToCorpus(by);
        return { done, report: { ...report } };
      },
    },
    {
      name: "sweep",
      budgetMs: 60_000,
      floorMs: 5_000,
      run: async (by) => {
        const { done, report } = await sweepCorpusVideos(by, {
          limit: envCount("SWEEP_PER_RUN", SWEEP_PER_RUN),
          staleBefore: new Date(started - REFRESH_AFTER_DAYS * DAY_MS),
        });
        return { done, report: { ...report } };
      },
    },
    {
      name: "publish",
      budgetMs: 45_000,
      floorMs: 5_000,
      run: async (by) => {
        const { done, report } = await publishCorpus(by);
        return { done, report: { ...report } };
      },
    },
    {
      name: "harvest",
      budgetMs: 150_000,
      floorMs: 5_000,
      run: async (by) => {
        if (pageBudget <= 0) {
          return { done: false, report: { skipped: "pages spent today" } };
        }
        const { done, report } = await harvestIntoCorpus(by, {
          totalPages: pageBudget,
          pagesPerChannel: envCount(
            "SUGGESTION_CHANNEL_PAGES_PER_CHANNEL",
            CHANNEL_PAGES_PER_CHANNEL
          ),
          resweepAfterMs: CHANNEL_RESWEEP_MS,
          maxCutsPerSong: CUTS_PER_SONG,
        });
        return { done, report: { ...report }, spent: { pages: report.pages } };
      },
    },
    {
      name: "resolve",
      budgetMs: 60_000,
      floorMs: 45_000,
      run: async (by) => {
        if (!useSearch) return { done: false, report: { skipped: "search=0" } };
        if (searchBudget <= 0) {
          return { done: false, report: { skipped: "searches spent today" } };
        }
        const { done, report } = await resolveWantedSongs(by, searchBudget);
        return {
          done,
          report: { ...report },
          spent: { searches: report.searched + report.widened },
        };
      },
    },
  ];

  const ran: Record<string, unknown> = {};
  let reserved = steps.reduce((total, step) => total + step.floorMs, 0);
  try {
    for (const step of steps) {
      reserved -= step.floorMs;
      const by = Math.min(Date.now() + step.budgetMs, deadline - reserved);
      try {
        const { done, report, spent: took } = await step.run(by);
        ran[step.name] = { done, ...report };
        // Before the next step, not at the end: a run killed at the function
        // cap never reaches its cleanup, and units it didn't write down are
        // units the next slot spends over again.
        if (took) await recordSpend(started, took);
      } catch (e: any) {
        // Never a 500: the cursors the other steps wrote are what tomorrow
        // resumes from, and Vercel retries nothing either way.
        console.warn("Corpus cron step failed:", step.name, e?.message);
        ran[step.name] = { done: false, error: e?.message ?? "failed" };
      }
    }
  } finally {
    // Released rather than left to expire, or a one-minute run locks out the
    // slot behind it.
    await releaseRun(Date.now()).catch(() => {});
  }

  const report = {
    slot,
    steps: ran,
    budget: { searches: searchBudget, pages: pageBudget },
    catalog: suggestionCatalog().size,
    ms: Date.now() - started,
  };
  console.log("Corpus cron run:", JSON.stringify(report));
  res.status(200).json(report);
}
