import type { NextApiRequest } from "next";
import { isAnalyticsExempt } from "./analytics";
import { getOpsAlertsCollection } from "./mongodb";
import { pacificDayKey, quotaResetsAt } from "./pacificTime";

// Warm-instance short-circuit; the Mongo doc below stays the cross-instance
// authority. Without it a spent-quota day adds a write round-trip to every
// search, on the path where the user is already waiting for a degraded answer.
let alertedDay: string | null = null;
let markedDay: string | null = null;

/** Test seam: module state outlives a `vi.clearAllMocks()`. */
export function resetQuotaAlertMemo(): void {
  alertedDay = null;
  markedDay = null;
}

// Durable "today's search quota is spent" marker, read by room polls (see
// lib/searchQuotaStatus) so singers can be told when search comes back. Kept
// separate from the alert mutex below: that doc is deleted to retry a failed
// ntfy send, and must not blink the status flag off with it.
async function markQuotaOutDay(day: string): Promise<void> {
  if (markedDay === day) return;
  try {
    const alerts = await getOpsAlertsCollection();
    await alerts.insertOne({ _id: `quota-out:${day}`, sentAt: new Date() });
    markedDay = day;
  } catch (e: unknown) {
    if ((e as { code?: number })?.code === 11000) {
      markedDay = day; // another instance already marked today
      return;
    }
    console.warn("Quota-out marker write failed:", e);
  }
}

// ntfy.sh topics are public-by-name: anyone who knows the topic string can
// read it, so NTFY_TOPIC must be unguessable and is treated as a secret.
export async function sendQuotaAlertOnce(req: NextApiRequest): Promise<void> {
  if (isAnalyticsExempt(req)) return; // dev/demo quota trips are not incidents

  const day = pacificDayKey();
  // Recorded even when paging is unconfigured — the status flag is for
  // singers, not for ops.
  await markQuotaOutDay(day);

  const topic = process.env.NTFY_TOPIC;
  if (!topic) return;
  if (alertedDay === day) return;

  const id = `quota:${day}`;
  let alerts;
  try {
    alerts = await getOpsAlertsCollection();
    // The insert is the day's cross-instance mutex: a duplicate-key error
    // (11000) means the alert already went out. See lib/mongodb for why the
    // key is `_id` and not a unique index.
    await alerts.insertOne({ _id: id, sentAt: new Date() });
  } catch (e: unknown) {
    if ((e as { code?: number })?.code === 11000) {
      alertedDay = day; // already alerted today, by us or by another instance
      return;
    }
    console.warn("Quota alert dedupe failed:", e);
    return; // can't prove it's the first trip — stay quiet rather than spam
  }

  try {
    const resetsAt = new Date(quotaResetsAt());
    const resp = await fetch(`https://ntfy.sh/${topic}`, {
      method: "POST",
      headers: {
        Title: "KaraoQ: YouTube search quota exhausted",
        Priority: "high",
        Tags: "warning",
      },
      body:
        `Live search is down for the day; searches degrade to stale cache. ` +
        `Quota resets ${resetsAt.toUTCString()}.`,
      signal: AbortSignal.timeout(3000),
    });
    if (!resp.ok) throw new Error(`ntfy responded ${resp.status}`);
    alertedDay = day;
  } catch (e) {
    console.warn("Quota alert send failed:", e);
    // Drop the mutex so the next trip retries. Holding it trades a transient
    // ntfy blip for an evening of silent downtime — the warn above only lands
    // in a Vercel log kept about an hour.
    try {
      await alerts.deleteOne({ _id: id });
    } catch (delErr) {
      console.warn("Quota alert dedupe rollback failed:", delErr);
    }
  }
}
