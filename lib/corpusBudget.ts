import { randomUUID } from "crypto";

import { getCronStateCollection } from "./mongodb";
import { pacificDayKey } from "./pacificTime";

// vercel.json invokes this cron more than once a day: a slot buys wall-clock and
// never units, every invocation drawing from the same day's ledger.

const LEDGER_ID = "budget";
const LOCK_ID = "run";

/** The corpus's share of the ~100 search.list calls a day; the rest is singers'. */
export const SEARCH_PER_DAY = 40;

/** ~835 units for 800 playlistItems.list pages — ~40,000 uploads a day. */
export const CHANNEL_PAGES_PER_DAY = 800;

export interface DailySpend {
  searches: number;
  pages: number;
}

/** The Pacific day: that is the one YouTube resets the allowance on, and on UTC
 *  the two cron slots straddle the reset. */
export function ledgerDay(at: number): string {
  return pacificDayKey(new Date(at));
}

export async function spentToday(at: number): Promise<DailySpend> {
  const state = await getCronStateCollection();
  const doc = await state.findOne({ _id: LEDGER_ID });
  return doc?.spend && doc.spend.day === ledgerDay(at)
    ? { searches: doc.spend.searches, pages: doc.spend.pages }
    : { searches: 0, pages: 0 };
}

export async function recordSpend(
  at: number,
  spent: Partial<DailySpend>
): Promise<void> {
  if (!spent.searches && !spent.pages) return;
  const held = await spentToday(at);
  const state = await getCronStateCollection();
  await state.updateOne(
    { _id: LEDGER_ID },
    {
      $set: {
        spend: {
          day: ledgerDay(at),
          searches: held.searches + (spent.searches ?? 0),
          pages: held.pages + (spent.pages ?? 0),
        },
        updatedAt: new Date(at),
      },
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
