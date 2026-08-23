import {
  SONG_SECTIONS,
  COUNTRY_CONFIG,
  LANGUAGE_PACKS,
  buildSongQuery,
  type SongSection,
  type SongSuggestion,
} from "../app/queue/songSuggestions";
import { buildSearchQuery, searchCacheKey } from "./searchQuery";

// Recognising queries here rather than trusting a client flag is what bounds the
// corpus: nothing outside this catalog can create a song. Imported rather than
// fetched from /public, so no network call and no filesystem assumptions.
import brPack from "../public/suggestions/br.json";
import czPack from "../public/suggestions/cz.json";
import dePack from "../public/suggestions/de.json";
import frPack from "../public/suggestions/fr.json";
import idPack from "../public/suggestions/id.json";
import inPack from "../public/suggestions/in.json";
import phPack from "../public/suggestions/ph.json";

const PACK_FILES: Record<string, SongSection> = {
  br: brPack as SongSection,
  cz: czPack as SongSection,
  de: dePack as SongSection,
  fr: frPack as SongSection,
  id: idPack as SongSection,
  in: inPack as SongSection,
  ph: phPack as SongSection,
};

/** Keyed off the lists the browse view offers, never hand-listed beside them: a
 *  pack shown but not catalogued costs a live search on every tap in it. */
export const PACK_SECTIONS: Record<string, SongSection> = {};
const offeredPackIds = LANGUAGE_PACKS.map((pack) => pack.packId).concat(
  Object.keys(COUNTRY_CONFIG)
    .map((country) => COUNTRY_CONFIG[country].regionalPack)
    .filter((packId): packId is string => !!packId)
);
for (const packId of offeredPackIds) {
  if (PACK_FILES[packId]) PACK_SECTIONS[packId] = PACK_FILES[packId];
}

export interface CatalogEntry {
  /** The cache key a tap on this song produces — how it's recognised. */
  key: string;
  query: string;
  title: string;
  artist: string;
  /** Japanese and Korean channels title uploads in native script, so matching
   *  only the romanisation finds nothing for those packs. */
  nativeTitle?: string;
  nativeArtist?: string;
  /** "core" for the built-in sections, else the language pack id. */
  packId: string;
  categoryId: string;
}

// A tap carries the room's filters, so a song has several keys in principle. Only
// the default combination is catalogued; a tap under changed filters just searches.
export const CATALOG_DURATION = "any";
export const CATALOG_SORT = "relevance";

function entriesFrom(section: SongSection, packId: string): CatalogEntry[] {
  return section.categories.flatMap((category) =>
    category.songs.map((song: SongSuggestion) => {
      const query = buildSearchQuery(buildSongQuery(song), true);
      return {
        key: searchCacheKey(query),
        query,
        title: song.title,
        artist: song.artist,
        ...(song.nativeTitle ? { nativeTitle: song.nativeTitle } : {}),
        ...(song.nativeArtist ? { nativeArtist: song.nativeArtist } : {}),
        packId,
        categoryId: category.id,
      };
    })
  );
}

let cached: Map<string, CatalogEntry> | null = null;
let packsByKey: Map<string, string[]> | null = null;

function build(): void {
  const entries = [
    ...SONG_SECTIONS.flatMap((s) => entriesFrom(s, "core")),
    ...Object.entries(PACK_SECTIONS).flatMap(([packId, section]) =>
      entriesFrom(section, packId)
    ),
  ];
  // Before the dedupe below, which reduces a song in two packs to the later one.
  packsByKey = new Map();
  for (const e of entries) {
    const packs = packsByKey.get(e.key) ?? [];
    if (packs.indexOf(e.packId) < 0) packs.push(e.packId);
    packsByKey.set(e.key, packs);
  }
  // One entry per key is what makes it the store's natural _id.
  cached = new Map(entries.map((e) => [e.key, e]));
}

export function suggestionCatalog(): Map<string, CatalogEntry> {
  if (!cached) build();
  return cached!;
}

export function catalogEntry(key: string): CatalogEntry | undefined {
  return suggestionCatalog().get(key);
}

/** Every pack listing this song: a shelf filtering on `entry.packId` would only
 *  see the one the dedupe kept. */
export function catalogPackIds(key: string): string[] {
  if (!packsByKey) build();
  return packsByKey!.get(key) ?? [];
}

/** The default combination the catalog is keyed for. */
export function isCatalogFilters(duration: string, sortBy: string): boolean {
  return duration === CATALOG_DURATION && sortBy === CATALOG_SORT;
}
