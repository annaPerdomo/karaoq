import { randomUUID } from "crypto";

import { getCronStateCollection } from "./mongodb";
import { pacificDayKey, quotaResetsAtMs } from "./pacificTime";

// vercel.json invokes this cron more than once a day: a slot buys wall-clock and
// never units, every invocation drawing from the same day's ledger.

const LEDGER_ID = "budget";
const LOCK_ID = "run";

/** The most searches one night's resolving may buy; not a share of the day. */
export const SEARCH_PER_DAY = 40;

/** Google's stated search.list quota; the ledger's ceiling. */
export const SEARCH_DAY_QUOTA = 100;

/** How far under Google's console the ledger runs by day's end: the sweep's
 *  videos.list (~40 units/run) and searches that reached YouTube but never
 *  billed. YouTube's "per day" refusal has landed at 85 of 100, so it is only
 *  believed inside this margin. */
export const UNBILLED_SLACK_UNITS = 300;

/** ~835 units for 800 playlistItems.list pages — ~40,000 uploads a day. */
export const CHANNEL_PAGES_PER_DAY = 800;

/** A run past midnight bills tomorrow's quota to today; one much earlier
 *  takes the evening's last hour from rooms. */
export const MOP_UP_WINDOW_MS = 15 * 60_000;

export function insideMopUpWindow(now: number): boolean {
  const untilReset = quotaResetsAtMs(new Date(now)) - now;
  return untilReset > 0 && untilReset <= MOP_UP_WINDOW_MS;
}

export interface DailySpend {
  /** Every search.list call billed today, the rooms' and the cron's alike —
   *  the only number that says what the day actually cost. */
  searches: number;
  /** The cron's own share of `searches`. Held apart so a busy day of singing
   *  doesn't read as the cron having already taken its nightly bite. */
  cronSearches: number;
  pages: number;
  /** videos.list units bought outside the cron — today only the report endpoint.
   *  The sweep and the harvest spend units too and do not bill them here. */
  lookups: number;
}

/** The Pacific day: that is the one YouTube resets the allowance on. Both cron
 *  slots run in the Pacific evening, so a UTC key would file them under the day
 *  after the one whose quota they are spending. */
export function ledgerDay(at: number): string {
  return pacificDayKey(new Date(at));
}

/** One doc per Pacific day rather than one rolling doc: singers now bill to the
 *  same ledger as the cron (/api/search), so the read-modify-write this used to
 *  do would lose concurrent searches. Keying by day makes every write a plain
 *  $inc, and cron_state's TTL on updatedAt clears the old days by itself. */
function ledgerId(at: number): string {
  return `${LEDGER_ID}:${ledgerDay(at)}`;
}

export async function spentToday(at: number): Promise<DailySpend> {
  const state = await getCronStateCollection();
  const doc = await state.findOne({ _id: ledgerId(at) });
  return {
    searches: doc?.searches ?? 0,
    cronSearches: doc?.cronSearches ?? 0,
    pages: doc?.pages ?? 0,
    lookups: doc?.lookups ?? 0,
  };
}

/** Atomic, so a room searching while the cron resolves can't erase either
 *  side's spend. Bills to the day the call left in. */
export async function recordSpend(
  at: number,
  spent: Partial<DailySpend>
): Promise<void> {
  if (!spent.searches && !spent.cronSearches && !spent.pages && !spent.lookups) {
    return;
  }
  const state = await getCronStateCollection();
  await state.updateOne(
    { _id: ledgerId(at) },
    {
      $inc: {
        searches: spent.searches ?? 0,
        cronSearches: spent.cronSearches ?? 0,
        pages: spent.pages ?? 0,
        lookups: spent.lookups ?? 0,
      },
      // cursorAt, not updatedAt, is cron_state's TTL clock (lib/mongodb), and a
      // day's ledger should indeed be collected a week after its last write —
      // otherwise one doc per day accumulates forever.
      $set: { cursorAt: new Date(at), updatedAt: new Date(at) },
    },
    { upsert: true }
  );
}

export interface DaySpend extends DailySpend {
  day: string;
  mopUp?: MopUpOutcome;
}

export interface MopUpOutcome {
  at: Date;
  liveRooms: number;
  budget: number;
  searched: number;
  filled: number;
  skipped: string | null;
  quotaSpent: boolean;
  /** Distinguishes a step that threw from one that ran and found nothing. */
  error: string | null;
}

/** GitHub Actions and Vercel can both land inside the window; a skip must not
 *  clobber the real run's outcome. */
export async function recordMopUp(at: number, outcome: MopUpOutcome): Promise<void> {
  const state = await getCronStateCollection();
  if (outcome.searched === 0 && outcome.skipped) {
    const existing = await state.findOne({ _id: ledgerId(at) });
    if (existing?.mopUp) return;
  }
  await state.updateOne(
    { _id: ledgerId(at) },
    { $set: { mopUp: outcome, cursorAt: new Date(at), updatedAt: new Date(at) } },
    { upsert: true }
  );
}

// Google bills search.list at 100 and videos.list at 1; each search also spends
// one unit enriching its results (lib/youtubeSearch). The sweep and harvest
// videos.list calls are never recorded, so this reads under Google's console.
export const SEARCH_UNITS = 100;
export function estimateUnits(spent: DailySpend): number {
  return spent.searches * (SEARCH_UNITS + 1) + spent.pages + spent.lookups;
}

export function searchesLeft(
  spent: DailySpend,
  quotaSearches: number = SEARCH_DAY_QUOTA
): number {
  return Math.max(0, Math.floor(unitsLeft(spent, quotaSearches) / (SEARCH_UNITS + 1)));
}

export function unitsLeft(
  spent: DailySpend,
  quotaSearches: number = SEARCH_DAY_QUOTA
): number {
  return quotaSearches * SEARCH_UNITS - estimateUnits(spent);
}

function dayKeyBefore(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10);
}

// Oldest first, zero-filled. Only a week is readable: cron_state's TTL
// (lib/mongodb) collects older docs.
export async function spentRecent(at: number, days: number): Promise<DaySpend[]> {
  const today = ledgerDay(at);
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) keys.push(dayKeyBefore(today, i));
  const state = await getCronStateCollection();
  const docs = await state
    .find({ _id: { $in: keys.map((day) => `${LEDGER_ID}:${day}`) } })
    .toArray();
  const byId = new Map(docs.map((doc) => [doc._id, doc]));
  return keys.map((day) => {
    const doc = byId.get(`${LEDGER_ID}:${day}`);
    return {
      day,
      searches: doc?.searches ?? 0,
      cronSearches: doc?.cronSearches ?? 0,
      pages: doc?.pages ?? 0,
      lookups: doc?.lookups ?? 0,
      mopUp: doc?.mopUp,
    };
  });
}

export function remaining(allowance: number, spent: number): number {
  return Math.max(allowance - spent, 0);
}

/** Longer than the 300s function cap, so a killed run still frees the lock. */
const LEASE_MS = 6 * 60_000;

/** Vercel only guarantees a cron within its hour, exactly how far apart the slots
 *  are. Returns the token to release with; null means another run holds it. */
export async function acquireRun(at: number): Promise<string | null> {
  const state = await getCronStateCollection();
  const now = new Date(at);
  const until = new Date(at + LEASE_MS);
  const token = randomUUID();
  const taken = await state.updateOne(
    { _id: LOCK_ID, leaseUntil: { $lte: now } },
    { $set: { leaseUntil: until, leaseToken: token, updatedAt: now } }
  );
  if (taken.matchedCount > 0) return token;
  try {
    await state.insertOne({
      _id: LOCK_ID,
      leaseUntil: until,
      leaseToken: token,
      updatedAt: now,
    });
    return token;
  } catch (e: any) {
    // A held lease or a lost insert race; anything else is the database.
    if (e?.code === 11000) return null;
    throw e;
  }
}

/** Only its own lease: an overrunning run would otherwise free the successor's. */
export async function releaseRun(at: number, token: string): Promise<void> {
  const state = await getCronStateCollection();
  const now = new Date(at);
  await state.updateOne(
    { _id: LOCK_ID, leaseToken: token },
    { $set: { leaseUntil: now, updatedAt: now } }
  );
}
