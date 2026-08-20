import { describe, it, expect } from "vitest";
import { writeFileSync } from "fs";
import { loadLocalEnv } from "./env";

import {
  harvestKaraokeChannels,
  karaokeChannelHandles,
  type HarvestedVideo,
} from "../../lib/karaokeChannels";
import { matchHarvestToCatalog } from "../../lib/suggestionMatch";
import { suggestionCatalog } from "../../lib/suggestionCatalog";

// Run after editing KARAOKE_CHANNELS to see which handles resolve and how much
// of the catalog they cover. Costs 1 unit per handle plus 1 per page of 50, and
// no search.list. Empty cursors, so it never disturbs what the cron saved.
//
//   PROBE_LIVE=1 PROBE_PAGES=8 pnpm tool scripts/tools/probeHarvest.tool.ts
//   PROBE_LIVE=1 PROBE_HANDLES=SomeChannel,Another pnpm tool …
const LIVE = Boolean(process.env.PROBE_LIVE);

describe("channel harvest probe", () => {
  it.runIf(LIVE)("reports which handles resolve and how much of the catalog they cover", async () => {
    loadLocalEnv();
    const candidates = (process.env.PROBE_HANDLES ?? "").split(",").filter(Boolean);
    const handles = candidates.length > 0 ? candidates : karaokeChannelHandles();
    const pages = Number(process.env.PROBE_PAGES ?? 4);

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
    const catalog = Array.from(suggestionCatalog().values());
    const matches = matchHarvestToCatalog(videos, catalog, 4);

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
      `catalog songs    : ${catalog.length}`,
      `songs resolved   : ${matches.size}`,
      `cuts per channel : ${JSON.stringify(Object.fromEntries(byChannel))}`,
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
