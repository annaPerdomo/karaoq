import { getFeatureFlagsCollection } from "./mongodb";

export type FlagName = "songs_pages" | "boards_posting" | "corpus_cron";

export const FLAG_DEFAULTS: Record<FlagName, boolean> = {
  songs_pages: true,
  boards_posting: true,
  corpus_cron: true,
};

const FLAG_CACHE_STALE_MS = 60_000;
const FLAG_RETRY_AFTER_FAILURE_MS = 5_000;
const FLAG_READ_TIMEOUT_MS = 1_000;

let cached: Map<FlagName, boolean> | null = null;
let pending: Promise<Map<FlagName, boolean>> | null = null;
let refreshDue = true;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

async function readFlags(): Promise<Map<FlagName, boolean>> {
  const collection = await getFeatureFlagsCollection();
  const docs = await collection.find({}).toArray();
  const found = new Map<FlagName, boolean>();
  for (const doc of docs) {
    if (typeof doc.enabled === "boolean") found.set(doc._id as FlagName, doc.enabled);
  }
  return found;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function scheduleRefresh(ms: number): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshDue = true;
  }, ms);
}

// Shared by every caller, so concurrent calls trigger one find({}), not one
// each. Deliberately timer-driven, not Date.now()-gated: a caller mocking
// the clock must not perturb staleness.
function startRefresh(): Promise<Map<FlagName, boolean>> {
  if (!pending) {
    refreshDue = false;
    pending = readFlags()
      .then((flags) => {
        cached = flags;
        scheduleRefresh(FLAG_CACHE_STALE_MS);
        return flags;
      })
      .catch(() => {
        scheduleRefresh(FLAG_RETRY_AFTER_FAILURE_MS);
        return cached ?? new Map<FlagName, boolean>();
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

export async function isFlagEnabled(name: FlagName): Promise<boolean> {
  if (cached !== null) {
    if (refreshDue) startRefresh();
    return cached.has(name) ? (cached.get(name) as boolean) : FLAG_DEFAULTS[name];
  }

  if (!pending && !refreshDue) return FLAG_DEFAULTS[name];

  const flags = await withTimeout(startRefresh(), FLAG_READ_TIMEOUT_MS).catch(
    () => null
  );
  if (flags && cached) {
    return flags.has(name) ? (flags.get(name) as boolean) : FLAG_DEFAULTS[name];
  }
  return FLAG_DEFAULTS[name];
}

export function invalidateFlagCache(): void {
  cached = null;
  pending = null;
  refreshDue = true;
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}
