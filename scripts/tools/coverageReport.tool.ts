import { describe, it, expect } from "vitest";
import { writeFileSync } from "fs";
import { loadLocalEnv } from "./env";

// How much of the catalog is resolved, by pack and category, so the gap can be
// closed where it is rather than by waiting on the nightly search budget.
//
//   COVERAGE_LIVE=1 pnpm tool scripts/tools/coverageReport.tool.ts
const LIVE = Boolean(process.env.COVERAGE_LIVE);

import { getSuggestionVideosCollection } from "../../lib/mongodb";
import { suggestionCatalog } from "../../lib/suggestionCatalog";
import { THIN_RESULTS } from "../../lib/suggestionVideos";

describe("suggestion catalog coverage", () => {
  it.runIf(LIVE)("reports resolved share per pack and category", async () => {
    loadLocalEnv();
    const store = await getSuggestionVideosCollection();
    const docs = await store.find({}).toArray();
    const resolved = new Set(docs.map((d) => d._id));

    // How many arrangements each resolved song offers — channel-seeded entries
    // hold what the harvest matched, searched ones hold up to fifty.
    const buckets = new Map<string, number>();
    for (const d of docs) {
      const n = d.results.length;
      const label = n === 1 ? "1" : n <= 4 ? "2-4" : n <= 9 ? "5-9" : n <= 24 ? "10-24" : "25+";
      buckets.set(label, (buckets.get(label) ?? 0) + 1);
    }

    const byGroup = new Map<string, { done: number; total: number }>();
    const missingByGroup = new Map<string, string[]>();

    for (const entry of Array.from(suggestionCatalog().values())) {
      const group = `${entry.packId}/${entry.categoryId}`;
      const row = byGroup.get(group) ?? { done: 0, total: 0 };
      row.total += 1;
      if (resolved.has(entry.key)) {
        row.done += 1;
      } else {
        const missing = missingByGroup.get(group) ?? [];
        missing.push(`${entry.artist} — ${entry.title}`);
        missingByGroup.set(group, missing);
      }
      byGroup.set(group, row);
    }

    const rows = Array.from(byGroup.entries())
      .map(([group, r]) => ({ group, ...r, pct: Math.round((r.done / r.total) * 100) }))
      .sort((a, b) => a.pct - b.pct);

    // An entry under THIN_RESULTS is stored but doesn't answer queries yet.
    const serving = docs.filter((d) => d.results.length >= THIN_RESULTS).length;

    const lines = [
      `resolved: ${resolved.size} / ${suggestionCatalog().size}`,
      `serving : ${serving} (>= ${THIN_RESULTS} cuts; the rest still search)`,
      "",
      "options per resolved song:",
      ...["1", "2-4", "5-9", "10-24", "25+"].map(
        (b) => `  ${b.padEnd(6)} ${buckets.get(b) ?? 0} songs`
      ),
      "",
      "weakest groups first:",
      ...rows.map(
        (r) => `  ${String(r.pct).padStart(3)}%  ${r.done}/${r.total}  ${r.group}`
      ),
      "",
      "sample unresolved from the weakest groups:",
      ...rows.slice(0, 6).flatMap((r) => [
        `  [${r.group}]`,
        ...(missingByGroup.get(r.group) ?? []).slice(0, 6).map((s) => `      ${s}`),
      ]),
    ];
    writeFileSync("/tmp/coverage.txt", lines.join("\n"));
    expect(rows.length).toBeGreaterThan(0);
  }, 300_000);
});
