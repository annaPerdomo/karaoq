import { getCronStateCollection } from "./mongodb";
import { pacificDayKey } from "./pacificTime";

// YouTube's quota is a daily allowance and vercel.json invokes this cron more
// than once a day, so a slot buys wall-clock and never units: every invocation
// draws from the same day's ledger.

const LEDGER_ID = "budget";
const LOCK_ID = "run";

/** The corpus's share of the ~100 search.list calls a day the project gets.
 *  The rest stays for the queries singers type. */
export const SEARCH_PER_DAY = 40;

/** ~835 units for 800 playlistItems.list pages — ~40,000 uploads, walked from a
 *  saved cursor so successive days reach the deep end of a big channel. */
export const CHANNEL_PAGES_PER_DAY = 800;

export interface DailySpend {
  searches: number;
  pages: number;
}

/** The Pacific day, because that is the one YouTube resets the allowance on.
 *  On UTC the two cron slots straddle the PST reset: the first spends against
 *  yesterday's exhausted pool and the second, firing minutes after the refill,
 *  reads the ledger as already spent and skips the resolve entirely. */
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

/** Longer than the 300s function cap, so a run the platform kills still frees
 *  the lock well before the next slot an hour later. */
const LEASE_MS = 6 * 60_000;

/** Two overlapping runs both take the top of the same demand-ordered queue and
 *  buy the same searches twice, and Vercel only guarantees a cron within its
 *  hour — which is exactly how far apart the slots are. */
export async function acquireRun(at: number): Promise<boolean> {
  const state = await getCronStateCollection();
  const now = new Date(at);
  const until = new Date(at + LEASE_MS);
  const taken = await state.updateOne(
    { _id: LOCK_ID, leaseUntil: { $lte: now } },
    { $set: { leaseUntil: until, updatedAt: now } }
  );
  if (taken.matchedCount > 0) return true;
  try {
    await state.insertOne({ _id: LOCK_ID, leaseUntil: until, updatedAt: now });
    return true;
  } catch (e: any) {
    // A held lease or a lost insert race; anything else is the database.
    if (e?.code === 11000) return false;
    throw e;
  }
}

export async function releaseRun(at: number): Promise<void> {
  const state = await getCronStateCollection();
  const now = new Date(at);
  await state.updateOne({ _id: LOCK_ID }, { $set: { leaseUntil: now, updatedAt: now } });
}
