import { findSongForQuery } from "./corpusLookup";
import { readSongCuts, type ResolvedResult } from "./corpusRead";
import { getKaraokeVideosCollection } from "./mongodb";
import formatSongTitle from "./songTitle";

export const REFUSAL_CUT_LIMIT = 5;

export async function songKeyForVideo(videoId: string): Promise<string | null> {
  const videos = await getKaraokeVideosCollection();
  const row = await videos.findOne({ _id: videoId }, { projection: { songKeys: 1 } });
  return row?.songKeys?.[0] ?? null;
}

const NOISE_WORDS = /\b(official|music|video|mv|audio|hd|4k|lyric|lyrics|visualizer|remastered)\b/gi;

export function refusalSongQuery(title: string): string {
  return title
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/["|]/g, " ")
    .replace(/(^|\s)#\S*/g, " ")
    .replace(/(^|\s)[-#]+(?=\S)/g, "$1")
    .replace(NOISE_WORDS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function playableCutsFor(videoId: string, title: string): Promise<ResolvedResult[]> {
  try {
    const key =
      (await songKeyForVideo(videoId)) ??
      (await findSongForQuery(formatSongTitle(title))) ??
      (await findSongForQuery(refusalSongQuery(title)));
    if (!key) return [];
    const cuts = (await readSongCuts(key)) ?? [];
    return cuts.filter((c) => c.videoId !== videoId).slice(0, REFUSAL_CUT_LIMIT);
  } catch {
    return [];
  }
}
