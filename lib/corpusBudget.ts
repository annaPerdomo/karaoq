import { randomUUID } from "crypto";

import { CRON_STATE_TTL_SECONDS, getCronStateCollection } from "./mongodb";
import type { ResolvedSong } from "./corpusResolve";
import { pacificDayKey, quotaResetsAtMs } from "./pacificTime";

// vercel.json invokes this cron more than once a day: a slot buys wall-clock and
// never units, every invocation drawing from the same day's ledger.

const LEDGER_ID = "budget";
const LOCK_ID = "run";

/** The most searches one night's resolving may buy; not a share of the day. */
export const SEARCH_PER_DAY = 40;

/** Google's 10,000 calls/day, less headroom for the sweep/harvest videos.list
 *  calls the ledger never records; the ledger's ceiling. */
export const DAY_CALL_QUOTA = 9_500;

/** How far under Google's console the ledger runs by day's end: the sweep's
 *  videos.list calls and searches that reached YouTube but never billed.
 *  YouTube's "per day" refusal is only believed inside this margin of calls. */
export const UNBILLED_SLACK_CALLS = 300;

/** 800 playlistItems.list pages, one call each — ~40,000 uploads a day. */
export const CHANNEL_PAGES_PER_DAY = 800;

/** A run past midnight bills tomorrow's quota to today; one much earlier
 *  takes the evening's last hour from rooms. */
export const MOP_UP_WINDOW_MS = 15 * 60_000;

export function insideMopUpWindow(now: number): boolean {
  const untilReset = quotaResetsAtMs(new Date(now)) - now;
  return untilReset > 0 && untilReset <= MOP_UP_WINDOW_MS;
}

// Vercel's Hobby cron fires within the hour, not the minute, so DST decides
// which of vercel.json's two mop-up entries lands outside this window.
export const OUTSIDE_MOP_UP_WINDOW = "outside mop-up window";

export interface DailySpend {
  /** Every search.list call billed today, the rooms' and the cron's alike —
   *  the only number that says what the day actually cost. */
  searches: number;
  /** The cron's own share of `searches`. Held apart so a busy day of singing
   *  doesn't read as the cron having already taken its nightly bite. */
  cronSearches: number;
  /** The mop-up's share of `cronSearches`. Absent on days before it was kept. */
  mopUpSearches?: number;
  /** Searches billed on YouTube's word alone (lib/searchQuotaStatus
   *  confirmDailyOut): spend that reached Google but no counter above saw. */
  unloggedSearches?: number;
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

export const LEDGER_KEEP_DAYS = 31;

/** cron_state's one TTL index runs on `cursorAt` with a week's expiry, so a
 *  ledger doc outlives it by setting that clock the difference ahead. */
function ledgerExpiryClock(at: number): Date {
  return new Date(at + LEDGER_KEEP_DAYS * 86_400_000 - CRON_STATE_TTL_SECONDS * 1000);
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
  if (
    !spent.searches &&
    !spent.cronSearches &&
    !spent.mopUpSearches &&
    !spent.unloggedSearches &&
    !spent.pages &&
    !spent.lookups
  ) {
    return;
  }
  const state = await getCronStateCollection();
  await state.updateOne(
    { _id: ledgerId(at) },
    {
      $inc: {
        searches: spent.searches ?? 0,
        cronSearches: spent.cronSearches ?? 0,
        mopUpSearches: spent.mopUpSearches ?? 0,
        unloggedSearches: spent.unloggedSearches ?? 0,
        pages: spent.pages ?? 0,
        lookups: spent.lookups ?? 0,
      },
      // cursorAt, not updatedAt, is cron_state's TTL clock (lib/mongodb); without
      // it one doc per day accumulates forever.
      $set: { cursorAt: ledgerExpiryClock(at), updatedAt: new Date(at) },
    },
    { upsert: true }
  );
}

export interface DaySpend extends DailySpend {
  day: string;
  /** False for a day with no ledger doc: nothing billed, or already expired. */
  recorded: boolean;
  mopUp?: MopUpOutcome;
}

export interface MopUpOutcome {
  at: Date;
  liveRooms: number;
  budget: number;
  searched: number;
  filled: number;
  songs?: ResolvedSong[];
  skipped: string | null;
  quotaSpent: boolean;
  /** Distinguishes a step that threw from one that ran and found nothing. */
  error: string | null;
}

// vercel.json can fire two mop-up entries the same Pacific day; this ranks
// outcomes so a later write never downgrades what the ledger already holds.
function mopUpRank(outcome: MopUpOutcome): 0 | 1 | 2 {
  if (outcome.skipped === OUTSIDE_MOP_UP_WINDOW) return 0;
  if (outcome.searched > 0) return 2;
  return 1;
}

export async function recordMopUp(at: number, outcome: MopUpOutcome): Promise<void> {
  const state = await getCronStateCollection();
  const earlier = (await state.findOne({ _id: ledgerId(at) }))?.mopUp;
  const earlierRank = earlier ? mopUpRank(earlier) : -1;
  const rank = mopUpRank(outcome);
  if (earlierRank >= 0 && (rank === 0 || rank < earlierRank)) return;
  if (earlier && rank === 1 && earlierRank === 1 && earlier.error && !outcome.error) {
    return;
  }
  const merged: MopUpOutcome =
    earlier && rank === 2 && earlierRank === 2
      ? {
          ...outcome,
          budget: earlier.budget + outcome.budget,
          searched: earlier.searched + outcome.searched,
          filled: earlier.filled + outcome.filled,
          songs: [...(earlier.songs ?? []), ...(outcome.songs ?? [])],
        }
      : outcome;
  await state.updateOne(
    { _id: ledgerId(at) },
    { $set: { mopUp: merged, cursorAt: ledgerExpiryClock(at), updatedAt: new Date(at) } },
    { upsert: true }
  );
}

// search.list and videos.list each cost 1 call; each search also spends one
// call enriching its results (lib/youtubeSearch). The sweep and harvest
// videos.list calls are never recorded, so this reads under Google's console.
export const SEARCH_CALLS = 2;
export function estimateCalls(spent: DailySpend): number {
  return spent.searches * SEARCH_CALLS + spent.pages + spent.lookups;
}

export function callsLeft(
  spent: DailySpend,
  quotaCalls: number = DAY_CALL_QUOTA
): number {
  return quotaCalls - estimateCalls(spent);
}

export function searchesLeft(
  spent: DailySpend,
  quotaCalls: number = DAY_CALL_QUOTA
): number {
  return Math.max(0, Math.floor(callsLeft(spent, quotaCalls) / SEARCH_CALLS));
}

export function dayKeyBefore(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10);
}

// Oldest first, zero-filled. Only LEDGER_KEEP_DAYS are readable.
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
      recorded: Boolean(doc),
      searches: doc?.searches ?? 0,
      cronSearches: doc?.cronSearches ?? 0,
      mopUpSearches: doc?.mopUpSearches,
      unloggedSearches: doc?.unloggedSearches,
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
