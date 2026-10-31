import type { SearchResult } from "./searchCache";

const NOISE_WORDS = [
  "karaoke",
  "instrumental",
  "backing track",
  "minus one",
  "sing ?along",
  "lyrics?",
  "cover",
  "piano version",
  "key of",
  "in the style of",
  "караоке",
  "karaoké",
  "カラオケ",
  "노래방",
  "伴奏",
  "歌詞付き",
  "歌詞",
  "минус",
  "инструментал",
];

// \b fails on non-Latin text; boundaries use \p{L}/\p{N} lookarounds via new
// RegExp, since this project's ES5 target rejects a /u literal (lib/searchQuery.ts).
const BOUNDARY_BEFORE = "(?<![\\p{L}\\p{N}])";
const BOUNDARY_AFTER = "(?![\\p{L}\\p{N}])";
const NOISE_SOURCE = NOISE_WORDS.join("|");

export const ORIGINAL_NOISE = new RegExp(
  `${BOUNDARY_BEFORE}(?:${NOISE_SOURCE})${BOUNDARY_AFTER}`,
  "iu"
);

const LEFTOVER_NOISE_RE = new RegExp(
  `${BOUNDARY_BEFORE}(?:${NOISE_SOURCE}|version)${BOUNDARY_AFTER}`,
  "giu"
);

const BRACKET_RE = /[([【（「][^)\]】）」]*[)\]】）」]/g;
const BRACKET_EXTRA_NOISE_RE = /version|\bkey\b/i;
const BRACKET_PHRASES = ["originally performed by", "made famous by"];

function isNoiseBracket(inner: string): boolean {
  if (ORIGINAL_NOISE.test(inner) || BRACKET_EXTRA_NOISE_RE.test(inner)) return true;
  const lower = inner.toLowerCase();
  return BRACKET_PHRASES.some((phrase) => lower.includes(phrase));
}

const KARAOKE_CHANNELS = [
  "Sing King",
  "KaraFun",
  "Zoom Karaoke",
  "CC Karaoke",
  "Stingray Karaoke",
  "Karaoke Version",
];
const CHANNEL_ALT = KARAOKE_CHANNELS.join("|");
const CHANNEL_PREFIX_RE = new RegExp(`^(?:${CHANNEL_ALT})\\s*-\\s*`, "i");
const SEGMENT_SPLIT_RE = / \| |｜/;
const EDGE_PUNCT_RE = /^[\s\-|]+|[\s\-|]+$/g;

function isNoiseOnly(text: string): boolean {
  return text.replace(LEFTOVER_NOISE_RE, "").replace(/\s+/g, " ").trim().length === 0;
}

// Strips a trailing " - X" only when X is a known channel (± karaoke suffix)
// or pure noise — a subtitle ending in "Karaoke" (e.g. "Song - Karaoke Night") stays.
function stripTrailingChannel(text: string): string {
  const match = text.match(/^(.*)\s-\s(.+)$/);
  if (!match) return text;
  const [, head, rawTail] = match;
  const tailLower = rawTail.trim().toLowerCase();
  const isChannel = KARAOKE_CHANNELS.some((name) => {
    const n = name.toLowerCase();
    return tailLower === n || tailLower === `${n} karaoke` || tailLower === `${n} karaoke version`;
  });
  return isChannel || isNoiseOnly(rawTail) ? head : text;
}

function cleanSegment(segment: string): string {
  return stripTrailingChannel(segment.trim())
    .replace(LEFTOVER_NOISE_RE, "")
    .replace(EDGE_PUNCT_RE, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function originalVideoQuery(
  songTitle: string,
  corpus?: { artist: string; title: string } | null
): string | null {
  if (corpus) return `${corpus.artist} ${corpus.title} official video`;
  const picked = cleanSongTitle(songTitle);
  return picked === null ? null : `${picked} official video`;
}

export function cleanSongTitle(songTitle: string): string | null {
  const q = songTitle
    .replace(BRACKET_RE, (match) => (isNoiseBracket(match.slice(1, -1)) ? "" : match))
    .replace(CHANNEL_PREFIX_RE, "");

  const picked = q.split(SEGMENT_SPLIT_RE).map(cleanSegment).find((s) => s.length > 0) ?? "";

  return picked.length < 2 ? null : picked;
}

export interface OriginalVideoCandidate {
  videoId: string;
  title: string;
  durationSeconds?: number;
}

export function pickOriginalCandidateDetails(
  results: SearchResult[],
  max = 6
): OriginalVideoCandidate[] {
  return results
    .filter((r) => !ORIGINAL_NOISE.test(r.title))
    .slice()
    .sort((a, b) => Number(/official/i.test(b.title)) - Number(/official/i.test(a.title)))
    .slice(0, max)
    .map((r) => ({
      videoId: r.videoId,
      title: r.title,
      ...(r.durationSeconds ? { durationSeconds: r.durationSeconds } : {}),
    }));
}

export function pickOriginalCandidates(results: SearchResult[], max = 3): string[] {
  return pickOriginalCandidateDetails(results, max).map((c) => c.videoId);
}

/** A host's own search: whatever they asked for, karaoke cuts included. */
export function searchCandidateDetails(results: SearchResult[], max = 8): OriginalVideoCandidate[] {
  return results.slice(0, max).map((r) => ({
    videoId: r.videoId,
    title: r.title,
    ...(r.durationSeconds ? { durationSeconds: r.durationSeconds } : {}),
  }));
}
