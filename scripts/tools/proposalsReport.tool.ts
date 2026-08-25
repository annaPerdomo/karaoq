import { describe, it, expect } from "vitest";
import { writeFileSync } from "fs";
import { loadLocalEnv } from "./env";

// The curation queue: songs rooms are singing that no catalog entry claims.
// Runs the cron's own propose step first, so the queue is current rather than as
// of last night, then writes the ranking to /tmp/proposals.txt. Writes nothing
// but song_proposals and spends no YouTube units.
//
//   PROPOSALS_LIVE=1 pnpm tool scripts/tools/proposalsReport.tool.ts
const LIVE = Boolean(process.env.PROPOSALS_LIVE);

import { proposeUnmappedAdds } from "../../lib/corpusProposals";
import { getSongProposalsCollection } from "../../lib/mongodb";
import { MIN_ADD_ROOMS } from "../../lib/songCorpus";
import { songTokens } from "../../lib/suggestionMatch";

const TOP = 60;

// Only for the recurring-words roll-up below, never for clustering: these are
// the words channel branding and song grammar contribute, and they drowned the
// acts the section exists to surface.
const NOT_A_NAME = new Set(
  ("on with you as popularized by in of to my me it is are was for and or no not " +
    "key real full live new best song songs track cover vocal vocals screen " +
    "original higher lower male female piano acoustic love night day time").split(" ")
);

function countries(byCountry: Record<string, number>): string {
  return Object.keys(byCountry)
    .sort((a, b) => byCountry[b] - byCountry[a])
    .map((c) => `${c}:${byCountry[c]}`)
    .join(" ");
}

describe("song proposals", () => {
  it.runIf(LIVE)("ranks what rooms sing that the catalog has never heard of", async () => {
    loadLocalEnv();
    const { report } = await proposeUnmappedAdds(Date.now() + 120_000);
    const all = await (await getSongProposalsCollection()).find({}).toArray();

    const open = all.filter((p) => !p.status);
    const seconded = open
      .filter((p) => p.rooms >= MIN_ADD_ROOMS)
      .sort((a, b) => b.rooms - a.rooms || b.addCount - a.addCount);
    const single = open
      .filter((p) => p.rooms < MIN_ADD_ROOMS)
      .sort((a, b) => b.addCount - a.addCount);

    // A word shared across several proposals is usually an act, and an act with
    // three unclaimed songs is a pack entry rather than three catalog lines.
    const spread = new Map<string, number>();
    for (const p of open) {
      const seen: Record<string, boolean> = {};
      for (const t of songTokens(p.label)) {
        if (seen[t] || NOT_A_NAME.has(t) || t.length < 3) continue;
        seen[t] = true;
        spread.set(t, (spread.get(t) ?? 0) + 1);
      }
    }
    const recurring = Array.from(spread.entries())
      .filter(([, n]) => n >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    const line = (p: (typeof all)[number]) =>
      `  ${String(p.rooms).padStart(2)} rooms ${String(p.addCount).padStart(3)} adds  ` +
      `${p.label.slice(0, 60).padEnd(60)}  ${countries(p.addsByCountry ?? {})}` +
      (p.knownArtist ? `  [have ${p.knownArtist}]` : "");

    const lines = [
      `scanned ${report.scanned} unmapped add rows → ${report.clustered} songs, ` +
        `${report.seconded} seconded by a second room`,
      `queue: ${open.length} open, ${all.length - open.length} already ruled on`,
      "",
      `seconded — ${MIN_ADD_ROOMS}+ rooms, the bar a cut has to meet:`,
      ...(seconded.length ? seconded.slice(0, TOP).map(line) : ["  (none yet)"]),
      "",
      "one room only — a claim, not a consensus:",
      ...(single.length ? single.slice(0, TOP).map(line) : ["  (none)"]),
      "",
      "artists the catalog already carries — the song is the only gap:",
      ...(open.some((p) => p.knownArtist)
        ? open
            .filter((p) => p.knownArtist)
            .sort((a, b) => b.rooms - a.rooms || b.addCount - a.addCount)
            .slice(0, TOP)
            .map((p) => `  ${String(p.knownArtist).padEnd(24)} ${p.label.slice(0, 60)}`)
        : ["  (none)"]),
      "",
      "words recurring across proposals — likely an act worth a pack entry:",
      ...(recurring.length
        ? recurring.map(([t, n]) => `  ${String(n).padStart(2)} songs  ${t}`)
        : ["  (none)"]),
      "",
      "to approve: add the song to the pack JSON under public/suggestions/,",
      "then let the nightly migration seed it — the cuts are already banked.",
    ];
    writeFileSync("/tmp/proposals.txt", lines.join("\n"));
    expect(report.scanned).toBeGreaterThanOrEqual(0);
  }, 300_000);
});
