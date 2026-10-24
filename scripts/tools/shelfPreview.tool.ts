import { describe, it } from "vitest";
import { appendFileSync, writeFileSync } from "fs";
import { loadLocalEnv } from "./env";

// Read-only: what the idea shelves would show a country (and UI language)
// today, from the chart snapshots the cron has written. Writes nothing.
//
//   SHELF_LIVE=1 SHELF_COUNTRY=US SHELF_LANG=es pnpm tool scripts/tools/shelfPreview.tool.ts
//   → /tmp/shelf-preview-US-es.txt, plus the shelves as JSON beside it
const LIVE = Boolean(process.env.SHELF_LIVE);

import { computeShelves } from "../../lib/shelves";

describe("idea shelves preview", () => {
  it.runIf(LIVE)("prints every shelf", async () => {
    loadLocalEnv();
    const country = process.env.SHELF_COUNTRY ?? null;
    const language = process.env.SHELF_LANG ?? null;
    const file = `/tmp/shelf-preview-${country ?? "world"}-${language ?? "none"}.txt`;
    writeFileSync(file, "");
    const out = (line: string) => appendFileSync(file, line + "\n");

    const shelves = await computeShelves(country, language);
    writeFileSync(file.replace(/\.txt$/, ".json"), JSON.stringify(shelves));
    for (const shelf of shelves) {
      out(`${shelf.id.toUpperCase()} (${shelf.scope}: ${shelf.country ?? shelf.language ?? "world"}) ${shelf.songs.length} songs`);
      for (const s of shelf.songs) {
        const tag = s.isNew ? " NEW" : s.climb ? ` ▲${s.climb}` : s.rooms ? ` ${s.rooms} rooms` : "";
        out(`  ${s.rank ?? "-"} ${s.title} — ${s.artist}${tag}   [${s.videoTitle}]`);
      }
    }
  }, 120_000);
});
