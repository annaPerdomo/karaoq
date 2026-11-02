import { getFeatureFlagsCollection } from "./mongodb";

export type FlagName = "songs_pages" | "boards_posting" | "corpus_cron";

export const FLAG_DEFAULTS: Record<FlagName, boolean> = {
  songs_pages: true,
  boards_posting: true,
  corpus_cron: true,
};

const FLAG_CACHE_STALE_MS = 60_000;
const FLAG_RETRY_AFTER_FAILURE_MS = 5_000;

let cached: Map<FlagName, boolean> | null = null;
let pending: Promise<Map<FlagName, boolean>> | null = null;
let refreshDue = true;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
// Backstop for a frozen serverless instance whose scheduled refreshTimer
// never gets to run; performance.now() is also unaffected by Date mocks.
let nextRefreshAtPerf = 0;
// Lets invalidateFlagCache discard a read that was already in flight.
let generation = 0;

async function readFlags(): Promise<Map<FlagName, boolean>> {
  const collection = await getFeatureFlagsCollection();
  const docs = await collection.find({}).toArray();
  const found = new Map<FlagName, boolean>();
  for (const doc of docs) {
    if (typeof doc.enabled === "boolean") found.set(doc._id as FlagName, doc.enabled);
  }
  return found;
}

function scheduleRefresh(ms: number): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshDue = true;
  }, ms);
  refreshTimer.unref?.();
  nextRefreshAtPerf = performance.now() + ms;
}

// Timer-driven, not Date.now()-gated, so a caller mocking the clock can't
// perturb staleness.
function startRefresh(): Promise<Map<FlagName, boolean>> {
  if (!pending) {
    refreshDue = false;
    const gen = generation;
    const read: Promise<Map<FlagName, boolean>> = readFlags()
      .then((flags) => {
        if (gen === generation) {
          cached = flags;
          scheduleRefresh(FLAG_CACHE_STALE_MS);
        }
        return flags;
      })
      .catch(() => {
        if (gen === generation) scheduleRefresh(FLAG_RETRY_AFTER_FAILURE_MS);
        return cached ?? new Map<FlagName, boolean>();
      })
      .finally(() => {
        if (pending === read) pending = null;
      });
    pending = read;
  }
  return pending;
}

export async function isFlagEnabled(name: FlagName): Promise<boolean> {
  if (cached !== null) {
    if (refreshDue || performance.now() >= nextRefreshAtPerf) startRefresh();
    return cached.has(name) ? (cached.get(name) as boolean) : FLAG_DEFAULTS[name];
  }

  // No timeout on a cold instance: a slow first connect must not turn an
  // "off" switch back on, and every gated path hits Mongo next anyway.
  const flags = await startRefresh();
  return flags.has(name) ? (flags.get(name) as boolean) : FLAG_DEFAULTS[name];
}

/** Uncached, and throws when the read fails, for callers that must fail closed. */
export async function readFlagNow(name: FlagName): Promise<boolean> {
  const flags = await readFlags();
  return flags.has(name) ? (flags.get(name) as boolean) : FLAG_DEFAULTS[name];
}

export function invalidateFlagCache(): void {
  generation += 1;
  cached = null;
  pending = null;
  refreshDue = true;
  nextRefreshAtPerf = 0;
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}
