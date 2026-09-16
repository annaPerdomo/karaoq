import { describe, it } from "vitest";
import { writeFileSync } from "fs";
import { loadLocalEnv } from "./env";
import { ledgerDay } from "../../lib/corpusBudget";
import { quotaResetsAtMs } from "../../lib/pacificTime";
import { getAnalyticsDb, getCronStateCollection } from "../../lib/mongodb";

//   TRACE_LIVE=1 pnpm tool scripts/tools/searchTrace.tool.ts
const LIVE = Boolean(process.env.TRACE_LIVE);

describe("search trace", () => {
  it.runIf(LIVE)("traces today's search spend", async () => {
    loadLocalEnv();
    const day = ledgerDay(Date.now());
    const start = new Date(quotaResetsAtMs() - 24 * 3600_000);
    const out: string[] = [];
    const say = (s: string) => out.push(s);

    const state = await getCronStateCollection();
    say(`day ${day}  window from ${start.toISOString()}`);
    say(`ledger: ${JSON.stringify(await state.findOne({ _id: `budget:${day}` } as any))}`);
    const cronDocs = await state.find({ updatedAt: { $gte: start } } as any).toArray();
    say(`cron_state docs touched today: ${cronDocs.map((d: any) => d._id).join(", ")}`);
    for (const d of cronDocs) {
      if (!String(d._id).startsWith("budget")) say(JSON.stringify(d).slice(0, 1500));
    }

    const db = await getAnalyticsDb();
    const ev = db.collection("analytics_events");
    const runs = await ev
      .find({ type: { $in: ["search_run", "search_failed"] }, timestamp: { $gte: start } })
      .sort({ timestamp: 1 })
      .toArray();
    say(`\nsearch events today: ${runs.length}`);
    const by = new Map<string, number>();
    for (const r of runs) {
      const k = `${r.type}/${r.searchCache ?? r.failReason ?? "?"}`;
      by.set(k, (by.get(k) ?? 0) + 1);
    }
    say(`by outcome: ${JSON.stringify(Object.fromEntries(by))}`);
    say(`\nper event (Pacific time):`);
    for (const r of runs) {
      const t = new Date(r.timestamp).toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour12: false });
      say(
        `${t} ${r.type.padEnd(13)} ${(r.searchCache ?? r.failReason ?? "").padEnd(10)} room=${r.roomId ?? "-"} ` +
          `n=${r.resultCount ?? "-"} known=${r.songKnown ?? "-"} ${r.country ?? ""} ua=${(r.userAgent ?? "").slice(0, 40)} q="${r.query ?? ""}"`
      );
    }
    const rooms = new Map<string, number>();
    for (const r of runs) if (r.searchCache === "miss") rooms.set(r.roomId ?? "-", (rooms.get(r.roomId ?? "-") ?? 0) + 1);
    say(`\nlive misses by room: ${JSON.stringify(Object.fromEntries(rooms))}`);

    const other = await ev
      .find({ type: { $in: ["link_lookup", "room_created", "song_added"] }, timestamp: { $gte: start } })
      .toArray();
    const oc = new Map<string, number>();
    for (const r of other) oc.set(r.type, (oc.get(r.type) ?? 0) + 1);
    say(`other events today: ${JSON.stringify(Object.fromEntries(oc))}`);
    writeFileSync("/tmp/searchtrace.txt", out.join("\n"));
  });
});
