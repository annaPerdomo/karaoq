import { describe, it, expect } from "vitest";
import { writeFileSync } from "fs";
import { loadLocalEnv } from "./env";

// The migration check too: songs should reach the catalog's size, and cutless is
// what the resolver still owes.
//
//   COVERAGE_LIVE=1 pnpm tool scripts/tools/coverageReport.tool.ts
const LIVE = Boolean(process.env.COVERAGE_LIVE);

import {
  getCronStateCollection,
  getKaraokeSongsCollection,
  getKaraokeVideosCollection,
} from "../../lib/mongodb";
import { MIGRATION_ID } from "../../lib/corpusMigration";
import { MAX_CUTS } from "../../lib/songCorpus";
import { suggestionCatalog } from "../../lib/suggestionCatalog";

function bucket(n: number): string {
  return n === 0 ? "0" : n === 1 ? "1" : n <= 4 ? "2-4" : n <= 9 ? "5-9" : "10+";
}

describe("song corpus coverage", () => {
  it.runIf(LIVE)("reports what the corpus can serve, weakest packs first", async () => {
    loadLocalEnv();
    const songs = await (await getKaraokeSongsCollection()).find({}).toArray();
    const videos = await (await getKaraokeVideosCollection())
      .find({}, { projection: { sources: 1 } })
      .toArray();
    const migration = await (await getCronStateCollection()).findOne({
      _id: MIGRATION_ID,
    });

    const cut = new Set(songs.flatMap((s) => s.cuts ?? []));
    const resolved = songs.filter((s) => (s.cuts ?? []).length > 0);
    const cutless = songs.filter((s) => (s.cuts ?? []).length === 0);

    const buckets = new Map<string, number>();
    for (const s of songs) {
      const label = bucket((s.cuts ?? []).length);
      buckets.set(label, (buckets.get(label) ?? 0) + 1);
    }

    // A source per video, not per song: one video can arrive several ways.
    const sources = new Map<string, number>();
    for (const v of videos) {
      for (const name of ["adds", "harvest", "seed", "search"]) {
        if ((v.sources as Record<string, unknown> | undefined)?.[name]) {
          sources.set(name, (sources.get(name) ?? 0) + 1);
        }
      }
    }

    const byPack = new Map<string, { done: number; total: number }>();
    for (const s of songs) {
      for (const pack of s.packIds ?? ["(uncurated)"]) {
        const row = byPack.get(pack) ?? { done: 0, total: 0 };
        row.total += 1;
        if ((s.cuts ?? []).length > 0) row.done += 1;
        byPack.set(pack, row);
      }
    }
    const packs = Array.from(byPack.entries())
      .map(([pack, r]) => ({ pack, ...r, pct: Math.round((r.done / r.total) * 100) }))
      .sort((a, b) => a.pct - b.pct);

    const wanted = cutless
      .slice()
      .sort((a, b) => (b.demand ?? 0) - (a.demand ?? 0))
      .slice(0, 20);

    // A catalog song with no doc is an unfinished migration, or a pack added
    // since it ran — the resolver only ever sees stored songs.
    const missing = Array.from(suggestionCatalog().keys()).filter(
      (key) => !songs.some((s) => s._id === key)
    );

    const lines = [
      `migrate-v1: ${migration?.done ? "done" : migration?.cursor ?? "never ran"}`,
      "",
      `songs : ${songs.length} stored, ${resolved.length} with cuts, ` +
        `${cutless.length} cutless`,
      `videos: ${videos.length} stored, ${cut.size} named as a cut`,
      `catalog songs with no doc: ${missing.length}`,
      "",
      `cuts per song (cap ${MAX_CUTS}):`,
      ...["0", "1", "2-4", "5-9", "10+"].map(
        (b) => `  ${b.padEnd(5)} ${buckets.get(b) ?? 0} songs`
      ),
      "",
      "videos by source:",
      ...["adds", "harvest", "seed", "search"].map(
        (s) => `  ${s.padEnd(8)} ${sources.get(s) ?? 0}`
      ),
      "",
      "weakest packs first:",
      ...packs.map(
        (p) => `  ${String(p.pct).padStart(3)}%  ${p.done}/${p.total}  ${p.pack}`
      ),
      "",
      "most-wanted songs still cutless:",
      ...wanted.map(
        (s) => `  ${String(s.demand ?? 0).padStart(5)} taps  ${s.artist} — ${s.title}`
      ),
    ];
    writeFileSync("/tmp/corpus.txt", lines.join("\n"));
    // The catalog, not the corpus: empty is the honest answer before the first
    // migration run, and the report is what the tool is for.
    expect(suggestionCatalog().size).toBeGreaterThan(0);
  }, 300_000);
});
