import { describe, it, expect } from "vitest";
import { writeFileSync } from "fs";
import { loadLocalEnv } from "./env";

// Is search.list actually spent right now, and how deep is each channel?
// Costs 1 unit per channel plus one search.
//
//   QUOTA_PROBE=1 pnpm tool scripts/tools/quotaProbe.tool.ts
const LIVE = Boolean(process.env.QUOTA_PROBE);

import { karaokeChannelHandles } from "../../lib/karaokeChannels";

const KEY = () => process.env.YOUTUBE_API_KEY!;

async function uploadsPlaylist(handle: string): Promise<string | null> {
  const params = new URLSearchParams({
    part: "contentDetails",
    forHandle: handle,
    key: KEY(),
  });
  const r = await fetch("https://www.googleapis.com/youtube/v3/channels?" + params);
  if (!r.ok) return null;
  const d = await r.json();
  return d?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads ?? null;
}

/** playlistItems reports the playlist's full size in pageInfo, so one call says
 *  how deep a channel goes. */
async function uploadCount(playlistId: string): Promise<number> {
  const params = new URLSearchParams({
    part: "id",
    playlistId,
    maxResults: "1",
    key: KEY(),
  });
  const r = await fetch(
    "https://www.googleapis.com/youtube/v3/playlistItems?" + params
  );
  if (!r.ok) return -1;
  const d = await r.json();
  return d?.pageInfo?.totalResults ?? -1;
}

describe("quota and depth probe", () => {
  it.runIf(LIVE)("reports search availability and channel depth", async () => {
    loadLocalEnv();
    const lines: string[] = [];

    const sp = new URLSearchParams({
      part: "snippet",
      q: "abba dancing queen karaoke",
      type: "video",
      maxResults: "1",
      key: KEY(),
    });
    const sr = await fetch("https://www.googleapis.com/youtube/v3/search?" + sp);
    const sd = await sr.json().catch(() => null);
    lines.push(
      `search.list  : ${sr.status} ${
        sr.ok ? "AVAILABLE" : sd?.error?.errors?.[0]?.reason ?? "failed"
      }`
    );
    lines.push("");

    // The sweep resumes from a saved cursor, so the question is how many nights
    // the budget needs, not what goes permanently unread.
    const TOTAL_PAGES = Number(process.env.SUGGESTION_CHANNEL_PAGES ?? 800);
    const PER_CHANNEL = Number(
      process.env.SUGGESTION_CHANNEL_PAGES_PER_CHANNEL ?? 60
    );
    lines.push(
      `budget: ${TOTAL_PAGES} pages/night total, ${PER_CHANNEL} per channel`
    );
    lines.push("");
    let totalPages = 0;
    for (const handle of karaokeChannelHandles()) {
      const pl = await uploadsPlaylist(handle);
      if (!pl) {
        lines.push(`  ${handle.padEnd(28)} (unresolved)`);
        continue;
      }
      const total = await uploadCount(pl);
      const pages = Math.ceil(Math.max(total, 0) / 50);
      totalPages += pages;
      lines.push(
        `  ${handle.padEnd(28)} ${String(total).padStart(7)} uploads  ${String(
          pages
        ).padStart(4)} pages  ${Math.ceil(pages / PER_CHANNEL)} nights`
      );
    }
    lines.push("");
    lines.push(`pages for the whole corpus : ${totalPages}`);
    lines.push(`units for the whole corpus : ~${totalPages}`);
    lines.push(
      `nights at the current budget: ~${Math.ceil(totalPages / TOTAL_PAGES)}`
    );

    writeFileSync("/tmp/quota-probe.txt", lines.join("\n"));
    expect(lines.length).toBeGreaterThan(0);
  }, 600_000);
});
