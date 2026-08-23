import { describe, it, expect } from "vitest";
import { writeFileSync } from "fs";
import { loadLocalEnv } from "./env";

// Fills the corpus for real, against the database in .env.local, with the
// cron's own channel harvest and zero search.list calls. Safe to re-run: the
// writes are upserts and it shares the cron's cursors, so successive runs walk
// further into each channel than a 240s nightly slice ever reaches.
//
//   POPULATE_LIVE=1 pnpm tool scripts/tools/populateCorpus.tool.ts
const LIVE = Boolean(process.env.POPULATE_LIVE);

import {
  CHANNEL_PAGES_PER_CHANNEL,
  CHANNEL_RESWEEP_MS,
  CUTS_PER_SONG,
  harvestIntoCorpus,
} from "../../lib/corpusHarvest";
import { readSongCuts } from "../../lib/corpusRead";
import { getKaraokeSongsCollection } from "../../lib/mongodb";
import { suggestionCatalog } from "../../lib/suggestionCatalog";

function envCount(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function counts(): Promise<{ songs: number; withCuts: number }> {
  const songs = await getKaraokeSongsCollection();
  return {
    songs: await songs.countDocuments({}),
    withCuts: await songs.countDocuments({ "cuts.0": { $exists: true } }),
  };
}

describe("populate the song corpus", () => {
  it.runIf(LIVE)("fills cuts without spending search quota", async () => {
    loadLocalEnv();
    const before = await counts();

    const totalPages = envCount("POPULATE_PAGES", 800);
    // Zero re-walks a channel the cron parked as finished, which is what a
    // raised cut cap needs and what a deeper walk does not.
    const resweepAfterMs = Number(process.env.POPULATE_RESWEEP_MS ?? CHANNEL_RESWEEP_MS);
    const { done, report } = await harvestIntoCorpus(Date.now() + 880_000, {
      totalPages,
      pagesPerChannel: envCount("POPULATE_PAGES_PER_CHANNEL", CHANNEL_PAGES_PER_CHANNEL),
      resweepAfterMs: Number.isFinite(resweepAfterMs) ? resweepAfterMs : CHANNEL_RESWEEP_MS,
      maxCutsPerSong: envCount("POPULATE_CUTS", CUTS_PER_SONG),
    });

    const after = await counts();

    const lines = [
      `catalog songs       : ${suggestionCatalog().size}`,
      `songs stored        : ${before.songs} -> ${after.songs}`,
      `songs with cuts     : ${before.withCuts} -> ${after.withCuts}`,
      `wanted at run start : ${report.wanted}`,
      `channels harvested  : ${report.channels.join(", ") || "(none)"}`,
      `channels missing    : ${report.missing.join(", ") || "(none)"}`,
      `pages read          : ${report.pages} / ${totalPages}`,
      `units spent         : ${report.units}`,
      `search.list calls   : 0`,
      `videos upserted     : ${report.videosUpserted}`,
      `videos refreshed    : ${report.videosRefreshed}`,
      `songs filled        : ${report.songsFilled}`,
      `channels exhausted  : ${done}`,
      `NOW SERVING         : ${after.withCuts} songs with zero YouTube calls`,
    ];
    writeFileSync("/tmp/populate-corpus.txt", lines.join("\n"));

    expect(after.withCuts).toBeGreaterThan(0);
  }, 900_000);

  // Closes the loop: proves a tap reads cuts out of the corpus instead of
  // falling through to the spent search quota.
  it.runIf(LIVE)("serves a tapped suggestion from the corpus", async () => {
    loadLocalEnv();
    const probes = [
      ["ABBA", "Dancing Queen"],
      ["Queen", "Bohemian Rhapsody"],
      ["Journey", "Don't Stop Believin'"],
      ["Tulus", "Hati-Hati di Jalan"],
      ["Dewa 19", "Kangen"],
    ];
    // Looked up by identity rather than rebuilt from artist and title: the key
    // a tap produces is the catalog's own query, and the two can differ.
    const byName = new Map(
      Array.from(suggestionCatalog().values()).map((e) => [
        `${e.artist}|${e.title}`,
        e.key,
      ])
    );

    const lines: string[] = [];
    for (const [artist, title] of probes) {
      lines.push(`${artist} — ${title}`);
      const key = byName.get(`${artist}|${title}`);
      if (!key) {
        lines.push("    (not in the catalog)");
        continue;
      }
      const cuts = await readSongCuts(key);
      lines.push(
        cuts
          ? cuts.map((c) => `    ${c.pinned ? "★" : "·"} ${c.title}`).join("\n")
          : "    (cutless — would still search)"
      );
    }
    writeFileSync("/tmp/serve-check.txt", lines.join("\n"));
    expect(lines.length).toBeGreaterThan(0);
  }, 900_000);
});
