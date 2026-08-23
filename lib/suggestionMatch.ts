import { searchCacheKey } from "./searchQuery";
import type { CatalogEntry } from "./suggestionCatalog";
import type { HarvestedVideo } from "./karaokeChannels";

// A wrong match hands a room the wrong song and pins it there, so the rule is
// strict: every title word AND every artist word must be present.

// "with"/"without" look like filler but are half of "Without You" — stripping
// them reduced it to "you", which matched "I Know What You Want".
const FILLER = new Set([
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
]);

// An English-only marker rejected every Japanese and Korean upload.
const KARAOKE_MARKER =
  /karaoke|karaokê|instrumental|backing track|playback|sing[- ]?along|off\s*vocal|mr\s*removed|カラオケ|オフボーカル|노래방|반주|엠[아]?르|伴奏|卡拉|कराओके/i;

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
  return searchCacheKey(text)
    .split(" ")
    .filter((t) => t.length > 0 && !FILLER.has(t));
}

/** Order-free: channels put the artist first, last, or in a suffix. */
function covers(haystack: Set<string>, needle: string[]): boolean {
  return needle.length > 0 && needle.every((t) => haystack.has(t));
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

function variantsOf(entries: CatalogEntry[]): Variant[] {
  return entries
    .flatMap((entry) => {
      // A Japanese upload may be all native, all romanised, or one of each.
      const titles = uniqueForms(entry.title, entry.nativeTitle);
      const artists = uniqueForms(entry.artist, entry.nativeArtist);
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
function variantCovers(bag: Set<string>, v: Variant): boolean {
  return covers(bag, v.title) && covers(bag, v.artist);
}

/** Exported: a client-supplied videoId is a claim, and anything storing one
 *  against a catalog key has to prove the pairing. */
export function isCutOf(title: string, entry: CatalogEntry): boolean {
  if (!isKaraokeTrack(title)) return false;
  const bag = new Set(tokens(title));
  if (bag.size === 0) return false;
  return variantsOf([entry]).some((v) => variantCovers(bag, v));
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
    if (!isKaraokeTrack(video.title)) continue;
    const videoTokens = tokens(video.title);
    if (videoTokens.length === 0) continue;
    const bag = new Set(videoTokens);

    // One row per (video, song): a bilingual entry has a variant under each of
    // two pivots, and an upload titled in both would file twice.
    const filed = new Set<string>();
    for (const token of Array.from(bag)) {
      for (const w of index.get(token) ?? []) {
        if (filed.has(w.entry.key) || !variantCovers(bag, w)) continue;
        filed.add(w.entry.key);
        const rows = matches.get(w.entry.key) ?? [];
        rows.push({
          ...video,
          extra: videoTokens.length - w.title.length - w.artist.length,
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
