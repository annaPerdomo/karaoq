import { searchCacheKey } from "./searchQuery";
import { firstCreditedArtist } from "./chartCredit";
import type { CatalogEntry } from "./suggestionCatalog";
import type { HarvestedVideo } from "./karaokeChannels";

// A wrong match hands a room the wrong song and pins it there, so the rule is
// strict: every title word AND every artist word must be present.

// "with"/"without" look like filler but are half of "Without You" — stripping
// them reduced it to "you", which matched "I Know What You Want".
export const FILLER = new Set([
  "karaoke",
  "version",
  "versión",
  "instrumental",
  "backing",
  "lyrics",
  "official",
  "hd",
  "the",
  "a",
  "an",
  "feat",
  "ft",
  // Brand names channels title their uploads with, not real song words.
  "karafun",
]);

// An English-only marker rejected every Japanese and Korean upload.
const KARAOKE_MARKER =
  /karaoke|karaokê|instrumental|backing track|playback|sing[- ]?along|off\s*vocal|mr\s*removed|\bktv\b|カラオケ|オフボーカル|노래방|반주|엠[아]?르|伴奏|伴唱|卡拉|कराओके/i;

// YouTube's API returns titles HTML-escaped ("&#39;DESERVE&#39;"); the browser
// decodes them (lib/decodeHtml) but the server matches on the raw string.
const ENTITY = /&(#\d+|#x[0-9a-f]+|amp|quot|apos|lt|gt);/gi;
const NAMED: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };

export function decodeEntities(text: string): string {
  return text.replace(ENTITY, (whole, code: string) => {
    const lower = code.toLowerCase();
    if (lower[0] !== "#") return NAMED[lower] ?? whole;
    const n = lower[1] === "x" ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
    return Number.isFinite(n) ? String.fromCharCode(n) : whole;
  });
}

// Chinese, Japanese and Korean titles carry no spaces between words, so an
// upload's "晴天-周杰倫KTV" never splits into the words a catalog entry holds.
// Those scripts' words are matched inside a title word instead (inCjkRun).
const CJK = new RegExp("[\\u3040-\\u30ff\\u3400-\\u9fff\\uac00-\\ud7af\\uf900-\\ufaff]");

/** A name written as one word ("babymonster") is only read this long — two
 *  short words run together spell too many things. */
const MIN_COMPACT = 5;

// Hashtags mark a short or promo; the rest mark a reel rather than one song.
const NOT_A_TRACK =
  /#\w|greatest hits|collection|compilation|playlist|medley|\bvol\.?\s*\d|\bvolume\s*\d|challenge|who sang|highlight|top\s*\d\b|mashup/i;

/** Judged on the raw title, before normalisation strips the words that say so. */
export function isKaraokeTrack(title: string): boolean {
  return KARAOKE_MARKER.test(title) && !NOT_A_TRACK.test(title);
}

// "Halo" by "Beyoncé" is the shortest real catalog entry; raising this drops it.
// The "Without You" mismatch was FILLER eating a title word, not the count.
const MIN_TOKENS = 2;

function uniqueForms(romanised: string, native?: string): string[][] {
  const forms = [tokens(romanised)];
  if (native) {
    const nativeTokens = tokens(native);
    if (nativeTokens.join(" ") !== forms[0].join(" ")) forms.push(nativeTokens);
  }
  return forms.filter((f) => f.length > 0);
}

function tokens(text: string): string[] {
  return searchCacheKey(decodeEntities(text))
    .split(" ")
    .filter((t) => t.length > 0 && !FILLER.has(t));
}

/** Exported for the proposal feeder, which has to read a title into words the
 *  same way the matcher does, or the two disagree about what one song is. */
export function songTokens(text: string): string[] {
  return tokens(text);
}

interface Haystack {
  bag: Set<string>;
  words: string[];
}

function haystackOf(videoTokens: string[]): Haystack {
  return { bag: new Set(videoTokens), words: videoTokens };
}

/** "baby" + "monster" read as "babymonster": consecutive whole words only, so
 *  "Butterfly" never covers "Butter" and "Hero Enrique" never covers "Héroe". */
function spelledByRun(words: string[], joined: string): boolean {
  for (let i = 0; i < words.length; i++) {
    let run = "";
    for (let j = i; j < words.length && run.length < joined.length; j++) {
      run += words[j];
      if (j > i && run === joined) return true;
    }
  }
  return false;
}

/** One CJK character is too common a fragment to trust (恋 is in half that artist's titles). */
function inCjkRun(words: string[], t: string): boolean {
  return t.length >= 2 && CJK.test(t) && words.some((w) => w.indexOf(t) >= 0);
}

/** Order-free: channels put the artist first, last, or in a suffix. */
function covers(hay: Haystack, needle: string[]): boolean {
  if (needle.length === 0) return false;
  if (needle.every((t) => hay.bag.has(t) || inCjkRun(hay.words, t))) return true;
  const joined = needle.join("");
  return (
    joined.length >= MIN_COMPACT && (hay.bag.has(joined) || spelledByRun(hay.words, joined))
  );
}

export interface MatchedVideo extends HarvestedVideo {
  /** Extra words the channel added; fewer sorts first. */
  extra: number;
}
interface Variant {
  entry: CatalogEntry;
  title: string[];
  artist: string[];
}

/** The full credit, plus its lead act when the credit names several: uploads
 *  of "Victor Mendivil, Natanael Cano & Ovi" mostly name only Victor Mendivil. */
function artistForms(entry: CatalogEntry): string[][] {
  const forms = uniqueForms(entry.artist, entry.nativeArtist);
  const lead = tokens(firstCreditedArtist(entry.artist));
  if (lead.length > 0 && !forms.some((f) => f.join(" ") === lead.join(" "))) forms.push(lead);
  return forms;
}

function variantsOf(entries: CatalogEntry[]): Variant[] {
  return entries
    .flatMap((entry) => {
      // A Japanese upload may be all native, all romanised, or one of each.
      const titles = uniqueForms(entry.title, entry.nativeTitle);
      const artists = artistForms(entry);
      return titles.flatMap((title) =>
        artists.map((artist) => ({ entry, title, artist }))
      );
    })
    .filter((w) => w.title.length + w.artist.length >= MIN_TOKENS)
    // The title must say something the artist doesn't: { title: "Enrique",
    // artist: "Enrique Iglesias" } otherwise claims every upload of his.
    .filter((w) => {
      const artistWords = new Set(w.artist);
      return w.title.some((t) => !artistWords.has(t));
    });
}

/** A bare title match puts every cover of "September" under Earth, Wind & Fire. */
function variantCovers(hay: Haystack, v: Variant): boolean {
  return covers(hay, v.title) && covers(hay, v.artist);
}

/** Exported: a client-supplied videoId is a claim, and anything storing one
 *  against a catalog key has to prove the pairing. */
export function isCutOf(title: string, entry: CatalogEntry): boolean {
  const decoded = decodeEntities(title);
  if (!isKaraokeTrack(decoded)) return false;
  const videoTokens = tokens(decoded);
  if (videoTokens.length === 0) return false;
  const hay = haystackOf(videoTokens);
  return variantsOf([entry]).some((v) => variantCovers(hay, v));
}

export function matchHarvestToCatalog(
  videos: HarvestedVideo[],
  entries: CatalogEntry[],
  maxPerSong: number
): Map<string, MatchedVideo[]> {
  const matches = new Map<string, MatchedVideo[]>();
  if (entries.length === 0 || videos.length === 0) return matches;

  const wanted = variantsOf(entries);

  // ~1,500 variants × hundreds of thousands of uploads blows the function
  // timeout, so each variant is filed under its rarest token.
  const inVariants = new Map<string, number>();
  const pivotsFor = wanted.map((w) => Array.from(new Set([...w.title, ...w.artist])));
  pivotsFor.forEach((all) => {
    for (const t of all) inVariants.set(t, (inVariants.get(t) ?? 0) + 1);
  });
  const index = new Map<string, Variant[]>();
  wanted.forEach((w, i) => {
    const all = pivotsFor[i];
    const pivot = all.reduce((best, t) =>
      (inVariants.get(t) ?? 0) < (inVariants.get(best) ?? 0) ? t : best
    );
    const bucket = index.get(pivot) ?? [];
    bucket.push(w);
    index.set(pivot, bucket);
  });

  for (const video of videos) {
    if (!isKaraokeTrack(decodeEntities(video.title))) continue;
    const videoTokens = tokens(video.title);
    if (videoTokens.length === 0) continue;
    const hay = haystackOf(videoTokens);
    const bag = hay.bag;

    // One row per (video, song): a bilingual entry has a variant under each of
    // two pivots, and an upload titled in both would file twice.
    const filed = new Set<string>();
    for (const token of Array.from(bag)) {
      for (const w of index.get(token) ?? []) {
        if (filed.has(w.entry.key) || !variantCovers(hay, w)) continue;
        filed.add(w.entry.key);
        const rows = matches.get(w.entry.key) ?? [];
        rows.push({
          ...video,
          // Run-together matches go negative; never sort them ahead of exact ones.
          extra: Math.max(0, videoTokens.length - w.title.length - w.artist.length),
        });
        matches.set(w.entry.key, rows);
      }
    }
  }

  matches.forEach((rows, key) => {
    rows.sort((a, b) => a.extra - b.extra);
    matches.set(key, rows.slice(0, maxPerSong));
  });
  return matches;
}
