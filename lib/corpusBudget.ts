import { randomUUID } from "crypto";

import { getCronStateCollection } from "./mongodb";
import { pacificDayKey } from "./pacificTime";

// vercel.json invokes this cron more than once a day: a slot buys wall-clock and
// never units, every invocation drawing from the same day's ledger.

const LEDGER_ID = "budget";
const LOCK_ID = "run";

/** The most searches one night's resolving may buy. Deliberately NOT a share of
 *  some assumed daily total: the real ceiling is not a number we know (150+
 *  calls have landed in a day), so the cron earns its turn by running after the
 *  rooms and stopping the moment YouTube says no — see the gates in
 *  pages/api/cron/suggestions. */
export const SEARCH_PER_DAY = 40;

/** ~835 units for 800 playlistItems.list pages — ~40,000 uploads a day. */
export const CHANNEL_PAGES_PER_DAY = 800;

export interface DailySpend {
  /** Every search.list call billed today, the rooms' and the cron's alike —
   *  the only number that says what the day actually cost. */
  searches: number;
  /** The cron's own share of `searches`. Held apart so a busy day of singing
   *  doesn't read as the cron having already taken its nightly bite. */
  cronSearches: number;
  pages: number;
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
  };
}

/** Atomic, so a room searching while the cron resolves can't erase either
 *  side's spend. Bills to the day the call left in. */
export async function recordSpend(
  at: number,
  spent: Partial<DailySpend>
): Promise<void> {
  if (!spent.searches && !spent.cronSearches && !spent.pages) return;
  const state = await getCronStateCollection();
  await state.updateOne(
    { _id: ledgerId(at) },
    {
      $inc: {
        searches: spent.searches ?? 0,
        cronSearches: spent.cronSearches ?? 0,
        pages: spent.pages ?? 0,
      },
      // cursorAt, not updatedAt, is cron_state's TTL clock (lib/mongodb), and a
      // day's ledger should indeed be collected a week after its last write —
      // otherwise one doc per day accumulates forever.
      $set: { cursorAt: new Date(at), updatedAt: new Date(at) },
    },
    { upsert: true }
  );
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
