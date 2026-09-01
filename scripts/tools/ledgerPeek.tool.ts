import { describe, it } from "vitest";
import { writeFileSync } from "fs";
import { loadLocalEnv } from "./env";

//   LEDGER_LIVE=1 pnpm tool scripts/tools/ledgerPeek.tool.ts
const LIVE = Boolean(process.env.LEDGER_LIVE);

import { ledgerDay } from "../../lib/corpusBudget";
import { getCronStateCollection, getKaraokeSongsCollection } from "../../lib/mongodb";

describe("ledger peek", () => {
  it.runIf(LIVE)("prints today's spend and what resolve could reach", async () => {
    loadLocalEnv();
    const state = await getCronStateCollection();
    const day = ledgerDay(Date.now());
    const doc = await state.findOne({ _id: `budget:${day}` });
    const out: string[] = [];
    const say = (k: string, v: unknown) => out.push(`${k} ${v}`);
    say("pacific day     :", day);
    say("searches (all)  :", doc?.searches ?? 0);
    say("  cron's share  :", doc?.cronSearches ?? 0);
    say("harvest pages   :", doc?.pages ?? 0);
    say("lookups         :", doc?.lookups ?? 0);

    const songs = await getKaraokeSongsCollection();
    const now = new Date();
    const ready = {
      $or: [{ nextResolveAt: { $exists: false } }, { nextResolveAt: { $lte: now } }],
    };
    say("cutless songs   :", await songs.countDocuments({ cuts: [] }));
    say("  eligible now  :", await songs.countDocuments({ cuts: [], ...ready } as any));
    say("  in backoff    :", await songs.countDocuments({
      cuts: [],
      nextResolveAt: { $gt: now },
    }));
    writeFileSync("/tmp/ledger.txt", out.join("\n"));
  });
});
