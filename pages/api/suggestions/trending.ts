import type { NextApiRequest, NextApiResponse } from "next";
import {
  getSuggestionCacheCollection,
  getYoutubeSongDataCollection,
  type SuggestionCacheDoc,
} from "../../../lib/mongodb";

// "Trending on karaoq": most-added songs over the last two weeks, straight
// from our own analytics. Refreshed lazily — the first request after a cached
// doc goes stale pays one aggregation; everyone else reads the cache, and the
// CDN absorbs most traffic on top of that. Zero external APIs.
const REFRESH_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 14;
const MIN_COUNT = 3;
const MIN_ITEMS = 5;
const LIMIT = 20;

// Queue entries store raw YouTube video titles ("Artist - Song (Karaoke
// Version) [HD]"), so strip the karaoke-video noise before grouping — the
// same song from different karaoke channels should count as one.
export function cleanSongTitle(raw: string): string {
  return raw
    .replace(/[([][^)\]]*(karaoke|lyrics?|instrumental|official|video|audio|hd|4k|version|cover)[^)\]]*[)\]]/gi, "")
    .replace(/\|.*$/, "")
    .replace(/\b(karaoke( version)?|with lyrics|lyric video|from zoom|karafun|sing king|zzang)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*[-|–]\s*$/, "")
    .trim();
}

async function computeTrending(country: string | null) {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const match: Record<string, unknown> = {
    type: "song_added",
    timestamp: { $gte: since },
  };
  if (country) match.country = country;

  // Titles come from youtube_song_data, which holds at most 30 days of them
  // (lib/mongodb.ts) — comfortably wider than this 14-day window.
  const songData = await getYoutubeSongDataCollection();
  const rows = await songData
    .aggregate<{ _id: string; count: number; title: string }>([
      { $match: match },
      { $project: { songTitle: 1 } },
      { $match: { songTitle: { $type: "string", $ne: "" } } },
    ])
    .toArray()
    .then((docs) => {
      // Group in JS on the cleaned title; the event set for 14 days is small
      // and cleaning needs regex logic Mongo aggregation can't express well.
      const counts = new Map<string, { title: string; count: number }>();
      for (const doc of docs as unknown as { songTitle: string }[]) {
        const title = cleanSongTitle(doc.songTitle);
        if (!title) continue;
        const key = title.toLowerCase();
        const entry = counts.get(key);
        if (entry) entry.count += 1;
        else counts.set(key, { title, count: 1 });
      }
      return Array.from(counts.values())
        .filter((e) => e.count >= MIN_COUNT)
        .sort((a, b) => b.count - a.count)
        .slice(0, LIMIT)
        .map((e) => ({ title: e.title, artist: "", count: e.count }));
    });
  return rows;
}

async function getOrRefresh(key: string, country: string | null) {
  const cache = await getSuggestionCacheCollection();
  const hit = await cache.findOne({ key });
  if (hit && Date.now() - hit.computedAt.getTime() < REFRESH_MS) {
    return hit.items;
  }
  const items = await computeTrending(country);
  const doc: SuggestionCacheDoc = { key, items, computedAt: new Date() };
  await cache
    .updateOne({ key }, { $set: doc }, { upsert: true })
    .catch(() => {});
  return items;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const cParam = req.query.c;
    const c = typeof cParam === "string" && /^[A-Za-z]{2}$/.test(cParam)
      ? cParam.toUpperCase()
      : null;

    let items = c ? await getOrRefresh(`trending:${c}`, c) : [];
    // Not enough country-level signal → fall back to the global list.
    if (items.length < MIN_ITEMS) {
      items = await getOrRefresh("trending:global", null);
    }
    if (items.length < MIN_ITEMS) items = [];

    res.setHeader(
      "Cache-Control",
      "s-maxage=3600, stale-while-revalidate=86400"
    );
    res.status(200).json({ items });
  } catch (e) {
    console.error("Trending endpoint error:", e);
    res.status(200).json({ items: [] });
  }
}
