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
import { proposeUnmappedAdds, PROPOSAL_SCAN_LIMIT } from "../../../lib/corpusProposals";
import { publishCorpus } from "../../../lib/corpusPublish";
import { resolveWantedSongs } from "../../../lib/corpusResolve";
import {
  REFRESH_AFTER_DAYS,
  SWEEP_PER_RUN,
  sweepCorpusVideos,
} from "../../../lib/corpusSweep";
import { recordDemand } from "../../../lib/songCorpus";
import { suggestionCatalog } from "../../../lib/suggestionCatalog";
import { suggestionDemand } from "../../../lib/suggestionDemand";

// vercel.json invokes this twice because a full harvest outlasts the 300s
// function — the later slot buys clock, not quota (lib/corpusBudget). The run's
// deadline is held under the ceiling: being killed spends units and writes nothing.
export const config = { maxDuration: 300 };
const RUN_BUDGET_MS = 240_000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** No step may assume it finishes: stop starting work at the deadline, persist
 *  the cursor, hand back done:false. `bill` is called as units leave the day's
 *  allowance, never once at the end — a step that throws still spent them. */
type Step = (
  deadline: number,
  bill: (units: Partial<DailySpend>) => void
) => Promise<{ done: boolean; report: Record<string, unknown> }>;

interface StepSpec {
  name: string;
  run: Step;
  budgetMs: number;
  /** Held back for the steps after this one: handed the whole deadline, the
   *  harvest legitimately takes it and search opens on nothing. */
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
  // Closed when unset: a missing env var must not publish a quota-spending route.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ code: 401, message: "Unauthorized." });
    return;
  }

  // ?search=0 runs only the steps that don't touch search.list.
  const useSearch = req.query.search !== "0";
  // Nothing branches on it: it makes the second cron entry a distinct path.
  const slot = typeof req.query.slot === "string" ? req.query.slot : "1";

  const started = Date.now();
  const deadline = started + RUN_BUDGET_MS;

  const lease = await acquireRun(started);
  if (!lease) {
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

  /** Cheap and user-visible first; search is last, since rooms compete for it. */
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
      // Ahead of the resolver, whose queues it orders. Our own events, no units.
      name: "demand",
      budgetMs: 20_000,
      floorMs: 5_000,
      run: async (by) => {
        if (Date.now() >= by) return { done: false, report: { skipped: "no clock" } };
        const scored = await recordDemand(await suggestionDemand());
        return { done: true, report: { scored } };
      },
    },
    {
      // After demand and before the resolver, reading the same adds they do:
      // what no catalog entry claimed is the only demand a song outside the
      // catalog can show. Curation input — writes no song. Our own rows, no units.
      name: "propose",
      budgetMs: 20_000,
      floorMs: 5_000,
      run: async (by) => {
        const { done, report } = await proposeUnmappedAdds(
          by,
          envCount("SUGGESTION_PROPOSAL_SCAN", PROPOSAL_SCAN_LIMIT)
        );
        return { done, report: { ...report } };
      },
    },
    {
      name: "harvest",
      budgetMs: 150_000,
      floorMs: 5_000,
      run: async (by, bill) => {
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
          onPages: (pages) => bill({ pages }),
        });
        return { done, report: { ...report } };
      },
    },
    {
      name: "resolve",
      budgetMs: 60_000,
      floorMs: 45_000,
      run: async (by, bill) => {
        if (!useSearch) return { done: false, report: { skipped: "search=0" } };
        if (searchBudget <= 0) {
          return { done: false, report: { skipped: "searches spent today" } };
        }
        const { done, report } = await resolveWantedSongs(by, searchBudget, () =>
          bill({ searches: 1 })
        );
        return { done, report: { ...report } };
      },
    },
  ];

  const ran: Record<string, unknown> = {};
  let reserved = steps.reduce((total, step) => total + step.floorMs, 0);
  try {
    for (const step of steps) {
      reserved -= step.floorMs;
      const by = Math.min(Date.now() + step.budgetMs, deadline - reserved);
      const billed: DailySpend = { searches: 0, pages: 0 };
      try {
        const { done, report } = await step.run(by, (units) => {
          billed.searches += units.searches ?? 0;
          billed.pages += units.pages ?? 0;
        });
        ran[step.name] = { done, ...report };
      } catch (e: any) {
        // Never a 500: Vercel retries nothing either way.
        console.warn("Corpus cron step failed:", step.name, e?.message);
        ran[step.name] = { done: false, error: e?.message ?? "failed" };
      } finally {
        // Out of a failed step too: units nobody wrote down are units the next
        // slot spends over again.
        await recordSpend(started, billed).catch((e: any) => {
          console.warn("Corpus cron spend not recorded:", e?.message);
        });
      }
    }
  } finally {
    // Released rather than left to expire: a one-minute run would lock out the
    // slot behind it.
    await releaseRun(Date.now(), lease).catch(() => {});
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
