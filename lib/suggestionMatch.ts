import { searchCacheKey } from "./searchQuery";
import type { CatalogEntry } from "./suggestionCatalog";
import type { HarvestedVideo } from "./karaokeChannels";

// A wrong match hands a room the wrong song and pins it there, so the rule is
// strict: every title word AND every artist word must be present. Anything less
// falls through to a search, which is what used to happen anyway.

// Production words and articles only. "with"/"without" look like filler but are
// half of "Without You" — stripping them reduced it to "you", which then
// matched "I Know What You Want".
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

// A real track says so in its own language. An English-only marker rejected
// every Japanese and Korean upload, which is most of what those packs needed.
const KARAOKE_MARKER =
  /karaoke|karaokê|instrumental|backing track|playback|sing[- ]?along|off\s*vocal|mr\s*removed|カラオケ|オフボーカル|노래방|반주|엠[아]?르|伴奏|卡拉|कराओके/i;

// Hashtags mark a short or promo; the rest mark a reel rather than one song.
const NOT_A_TRACK =
  /#\w|greatest hits|collection|compilation|playlist|medley|\bvol\.?\s*\d|\bvolume\s*\d|challenge|who sang|highlight|top\s*\d\b|mashup/i;

/** Judged on the raw title, before normalisation strips the words that say so. */
export function isKaraokeTrack(title: string): boolean {
  return KARAOKE_MARKER.test(title) && !NOT_A_TRACK.test(title);
}

// "Halo" by "Beyoncé" is two words and still unambiguous once both must appear
// in a karaoke-marked title. Raising this would drop it; the "Without You"
// mismatch was FILLER eating a title word, not the count.
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
      // A Japanese upload may be all native, all romanised, or one of each, so
      // every combination counts. Each still passes the guards below on its own.
      const titles = uniqueForms(entry.title, entry.nativeTitle);
      const artists = uniqueForms(entry.artist, entry.nativeArtist);
      return titles.flatMap((title) =>
        artists.map((artist) => ({ entry, title, artist }))
      );
    })
    .filter((w) => w.title.length + w.artist.length >= MIN_TOKENS)
    // The title must say something the artist doesn't. The catalog has
    // { title: "Enrique", artist: "Enrique Iglesias" }, which otherwise claims
    // every one of that artist's uploads.
    .filter((w) => {
      const artistWords = new Set(w.artist);
      return w.title.some((t) => !artistWords.has(t));
    });
}

/** The artist is the discriminator: a bare title match would put every cover
 *  of "September" under Earth, Wind & Fire. */
function variantCovers(bag: Set<string>, v: Variant): boolean {
  return covers(bag, v.title) && covers(bag, v.artist);
}

/** Exported because anything storing a videoId against a catalog key must
 *  prove they belong together — a client-supplied videoId is a claim, not a
 *  fact. */
export function isCutOf(title: string, entry: CatalogEntry): boolean {
  if (!isKaraokeTrack(title)) return false;
  const bag = new Set(tokens(title));
  if (bag.size === 0) return false;
  return variantsOf([entry]).some((v) => variantCovers(bag, v));
}

/** A song matching several channels is the good case: those are different
 *  arrangements, which is what a search would have offered too. */
export function matchHarvestToCatalog(
  videos: HarvestedVideo[],
  entries: CatalogEntry[],
  maxPerSong: number
): Map<string, MatchedVideo[]> {
  const matches = new Map<string, MatchedVideo[]>();
  if (entries.length === 0 || videos.length === 0) return matches;

  const wanted = variantsOf(entries);

  // ~1,500 variants × hundreds of thousands of uploads is enough CPU to blow
  // the function timeout, so each variant is filed under its rarest token. One
  // pivot per variant, so no video ever tests the same variant twice.
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

    for (const token of Array.from(bag)) {
      for (const w of index.get(token) ?? []) {
        if (!variantCovers(bag, w)) continue;
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
