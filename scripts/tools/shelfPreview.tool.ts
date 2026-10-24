import { describe, it } from "vitest";
import { appendFileSync, writeFileSync } from "fs";
import { loadLocalEnv } from "./env";

// Read-only: what the idea shelves would show a country today, built from
// Apple's live charts rather than chart_snapshots, so it works before the cron
// has written one. Writes nothing to the database.
//
//   SHELF_LIVE=1 SHELF_COUNTRY=US pnpm tool scripts/tools/shelfPreview.tool.ts
//   → /tmp/shelf-preview-US.txt, plus the shelves as JSON beside it
const LIVE = Boolean(process.env.SHELF_LIVE);

import { CHART_COUNTRIES, cleanChartArtist, cleanChartTitle, fetchChart, firstCreditedArtist } from "../../lib/chartFeed";
import { buildSongDeduper } from "../../lib/corpusPromote";
import { getKaraokeSongsCollection, type ChartSnapshotDoc } from "../../lib/mongodb";
import { hydrateShelf, rankHot, rankRooms, readRoomAdds, readTrustedArtists } from "../../lib/shelves";
import { songKeyFor } from "../../lib/songEntry";

describe("idea shelves preview", () => {
  it.runIf(LIVE)("prints the hot and rooms shelves", async () => {
    loadLocalEnv();
    const country = process.env.SHELF_COUNTRY ?? null;
    const file = `/tmp/shelf-preview-${country ?? "world"}.txt`;
    const out = (line: string) => appendFileSync(file, line + "\n");
    const songs = await getKaraokeSongsCollection();
    const deduper = buildSongDeduper(
      await songs
        .find({}, { projection: { title: 1, artist: 1, nativeTitle: 1, nativeArtist: 1, origin: 1 } })
        .toArray()
    );
    const now = new Date();
    const snapshots: ChartSnapshotDoc[] = [];
    // A charted country needs only its own chart; the worldwide pool needs all.
    const own = CHART_COUNTRIES.find((cc) => cc === country?.toLowerCase());
    for (const cc of own ? [own] : CHART_COUNTRIES) {
      const chart = await fetchChart(cc, fetch, 8000).catch(() => []);
      const seen = new Set<string>();
      const ranks = [];
      for (const row of chart) {
        const artist = cleanChartArtist(row.artist);
        const title = cleanChartTitle(row.title);
        if (!artist || !title) continue;
        const first = firstCreditedArtist(artist);
        const key =
          deduper.find(artist, title) ??
          (first !== artist ? deduper.find(first, title) : null) ??
          songKeyFor(artist, title);
        if (seen.has(key)) continue;
        seen.add(key);
        ranks.push({ key, rank: row.rank });
      }
      snapshots.push({ _id: cc, ranks, fetchedAt: now });
    }

    const hot = rankHot(snapshots, country, now);
    const trusted = await readTrustedArtists();
    const hotSongs = await hydrateShelf(hot.ranked, new Set(), trusted);
    const rooms = rankRooms(await readRoomAdds(now), country);
    const roomSongs = await hydrateShelf(rooms.ranked, new Set(hotSongs.map((s) => s.key)), trusted);

    writeFileSync(
      file.replace(/\.txt$/, ".json"),
      JSON.stringify([
        { id: "hot", country: hot.country, songs: hotSongs },
        { id: "rooms", country: rooms.country, songs: roomSongs },
      ])
    );
    out(`HOT (${hot.country ?? "world"}) ${hotSongs.length} songs from ${hot.ranked.length} charted`);
    for (const s of hotSongs) out(`  #${s.rank} ${s.title} — ${s.artist}   [${s.videoTitle}]`);
    out(`ROOMS (${rooms.country ?? "world"}) ${roomSongs.length} songs from ${rooms.ranked.length} ranked`);
    for (const s of roomSongs) out(`  ${s.rooms} rooms  ${s.title} — ${s.artist}   [${s.videoTitle}]`);
  }, 120_000);
});
