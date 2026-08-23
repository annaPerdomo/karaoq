import { describe, it, expect } from "vitest";
import { writeFileSync } from "fs";
import { loadLocalEnv } from "./env";

import {
  harvestKaraokeChannels,
  karaokeChannelHandles,
  type HarvestedVideo,
} from "../../lib/karaokeChannels";
import { getKaraokeSongsCollection } from "../../lib/mongodb";
import { MAX_CUTS } from "../../lib/songCorpus";
import { matchHarvestToCatalog } from "../../lib/suggestionMatch";
import { suggestionCatalog, type CatalogEntry } from "../../lib/suggestionCatalog";

// Run after editing KARAOKE_CHANNELS to see which handles resolve and how much of
// the corpus they would fill. 1 unit per handle plus 1 per page of 50, no
// search.list. Empty cursors and no writes, so the cron's own are undisturbed.
//
//   PROBE_LIVE=1 PROBE_PAGES=8 pnpm tool scripts/tools/probeHarvest.tool.ts
//   PROBE_LIVE=1 PROBE_HANDLES=SomeChannel,Another pnpm tool …
const LIVE = Boolean(process.env.PROBE_LIVE);

describe("channel harvest probe", () => {
  it.runIf(LIVE)("reports which handles resolve and how much of the corpus they cover", async () => {
    loadLocalEnv();
    const candidates = (process.env.PROBE_HANDLES ?? "").split(",").filter(Boolean);
    const handles = candidates.length > 0 ? candidates : karaokeChannelHandles();
    const pages = Number(process.env.PROBE_PAGES ?? 4);

    // The two sets the harvest step works from: songs short of the cap are what
    // it matches against, cutless ones what a new handle is judged on.
    const stored = await (await getKaraokeSongsCollection())
      .find({}, { projection: { cuts: 1 } })
      .toArray();
    const cutCounts = new Map(stored.map((s) => [s._id, (s.cuts ?? []).length]));
    const wanted: CatalogEntry[] = Array.from(suggestionCatalog().values()).filter(
      (e) => (cutCounts.get(e.key) ?? 0) < MAX_CUTS
    );
    const cutless = new Set(
      wanted.filter((e) => (cutCounts.get(e.key) ?? 0) === 0).map((e) => e.key)
    );

    const videos: HarvestedVideo[] = [];
    const harvest = await harvestKaraokeChannels(handles, {
      totalPages: pages * handles.length,
      pagesPerChannel: pages,
      cursors: new Map(),
      deadlineMs: Date.now() + 280_000,
      resweepAfterMs: 0,
      onChannel: async (batch) => {
        videos.push(...batch.videos);
      },
    });
    const matches = matchHarvestToCatalog(videos, wanted, 4);
    const newlyServable = Array.from(matches.keys()).filter((key) => cutless.has(key));

    const byChannel = new Map<string, number>();
    for (const rows of Array.from(matches.values())) {
      for (const row of rows) {
        byChannel.set(row.channel, (byChannel.get(row.channel) ?? 0) + 1);
      }
    }

    const lines = [
      `resolved handles : ${harvest.channels.join(", ") || "(none)"}`,
      `missing handles  : ${harvest.missing.join(", ") || "(none)"}`,
      `uploads read     : ${videos.length}`,
      `units spent      : ${harvest.units}`,
      `songs stored     : ${stored.length}`,
      `songs under cap  : ${wanted.length} (${cutless.size} of them cutless)`,
      `songs matched    : ${matches.size}`,
      `cutless filled   : ${newlyServable.length}`,
      `cuts per channel : ${JSON.stringify(Object.fromEntries(byChannel))}`,
      "",
      "cutless songs this harvest would make servable:",
      ...newlyServable.slice(0, 15).map((key) => {
        const entry = suggestionCatalog().get(key)!;
        return `  ${entry.artist} — ${entry.title}  [${entry.packId}]`;
      }),
      "",
      "sample matches:",
      ...Array.from(matches.entries()).slice(0, 15).flatMap(([key, rows]) => {
        const entry = suggestionCatalog().get(key)!;
        return [
          `  ${entry.artist} — ${entry.title}  [${entry.packId}]`,
          ...rows.slice(0, 2).map((r) => `      ↳ ${r.title}`),
        ];
      }),
      "",
      "sample raw uploads:",
      ...videos.slice(0, 8).map((v) => `  [${v.channel}] ${v.title}`),
    ];
    writeFileSync("/tmp/harvest-probe.txt", lines.join("\n"));

    expect(harvest.units).toBeGreaterThan(0);
  }, 300_000);
});
