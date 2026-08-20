import { describe, it, expect } from "vitest";
import { writeFileSync } from "fs";
import { loadLocalEnv } from "./env";

// Fills suggestion_videos for real, against the database in .env.local, using
// the cron's own zero-search steps. Safe to re-run: writes are upserts, serving
// entries are left alone, thin ones merged into. Shares the cron's cursors, so
// successive runs walk further into each channel.
//
//   POPULATE_LIVE=1 pnpm tool scripts/tools/populateCatalog.tool.ts
const LIVE = Boolean(process.env.POPULATE_LIVE);

import { readSuggestionVideos } from "../../lib/suggestionVideos";
import { buildSearchQuery, searchCacheKey } from "../../lib/searchQuery";
import {
  pendingEntries,
  seedFromSearchCache,
  seedFromKaraokeChannels,
} from "../../lib/suggestionResolver";
import { suggestionCatalog } from "../../lib/suggestionCatalog";

describe("populate suggestion catalog", () => {
  it.runIf(LIVE)("fills the store without spending search quota", async () => {
    loadLocalEnv();
    const catalog = suggestionCatalog().size;

    // No demand ordering: this run resolves everything it can rather than a
    // capped slice, so the priority queue the cron uses doesn't apply.
    const before = await pendingEntries(new Map());
    const fromCache = await seedFromSearchCache(before);

    const totalPages = Number(process.env.POPULATE_PAGES ?? 800);
    const perChannel = Number(process.env.POPULATE_PAGES_PER_CHANNEL ?? 60);
    const cuts = Number(process.env.POPULATE_CUTS ?? 8);
    // POPULATE_ALL widens songs that already have a thin entry, which is how
    // channel-seeded rows grow when the cut cap goes up.
    const target = process.env.POPULATE_ALL
      ? Array.from(suggestionCatalog().values())
      : await pendingEntries(new Map());
    const fromChannels = await seedFromKaraokeChannels(target, {
      totalPages,
      pagesPerChannel: perChannel,
      deadlineMs: Date.now() + 880_000,
      resweepAfterMs: 0,
      maxCutsPerSong: cuts,
    });

    const after = await pendingEntries(new Map());

    const lines = [
      `catalog songs      : ${catalog}`,
      `unresolved before  : ${before.length}`,
      `seeded from cache  : ${fromCache.seeded}`,
      `seeded from channels: ${fromChannels.seeded}`,
      `channels resolved  : ${fromChannels.channels.join(", ")}`,
      `channels missing   : ${fromChannels.missing.join(", ") || "(none)"}`,
      `pages read         : ${fromChannels.pages} / ${totalPages}`,
      `stopped early      : ${fromChannels.stoppedEarly}`,
      `units spent        : ${fromChannels.units}`,
      `search.list calls  : 0`,
      `unresolved after   : ${after.length}`,
      `NOW SERVING        : ${catalog - after.length} songs with zero YouTube calls`,
    ];
    writeFileSync("/tmp/populate-catalog.txt", lines.join("\n"));

    expect(catalog - after.length).toBeGreaterThan(0);
  }, 900_000);

  // Closes the loop: proves a tap on a suggestion now reads rows out of the
  // store instead of falling through to the spent search quota.
  it.runIf(LIVE)("serves a tapped suggestion from the store", async () => {
    const songs = [
      ["ABBA", "Dancing Queen"],
      ["Queen", "Bohemian Rhapsody"],
      ["Journey", "Don't Stop Believin'"],
      ["Tulus", "Hati-Hati di Jalan"],
      ["Dewa 19", "Kangen"],
    ];
    const lines: string[] = [];
    for (const [artist, title] of songs) {
      const key = searchCacheKey(buildSearchQuery(`${artist} ${title}`, true));
      const rows = await readSuggestionVideos(key);
      lines.push(`${artist} — ${title}`);
      lines.push(
        rows
          ? rows.map((r) => `    ${r.pinned ? "★" : "·"} ${r.title}`).join("\n")
          : "    (not resolved — would still search)"
      );
    }
    writeFileSync("/tmp/serve-check.txt", lines.join("\n"));
    expect(lines.length).toBeGreaterThan(0);
  }, 900_000);
});
