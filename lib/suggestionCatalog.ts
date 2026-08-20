import {
  SONG_SECTIONS,
  LANGUAGE_PACKS,
  buildSongQuery,
  type SongSection,
  type SongSuggestion,
} from "../app/queue/songSuggestions";
import { buildSearchQuery, searchCacheKey } from "./searchQuery";

// The ~900 songs in "Song ideas" are a fixed catalog, yet every tap used to
// cost a search.list call — two thirds of a day's quota per cache window, which
// one browsing room can burn. The server keeps its own copy so it can recognise
// a suggestion query on sight and serve it from lib/suggestionVideos.
//
// Recognising queries server-side rather than trusting a client flag is what
// bounds the store: nothing outside this catalog can create an entry.

// Imported rather than fetched from /public, so the server sees what the
// browser does with no network call and no filesystem assumptions on Vercel.
import brPack from "../public/suggestions/br.json";
import czPack from "../public/suggestions/cz.json";
import dePack from "../public/suggestions/de.json";
import frPack from "../public/suggestions/fr.json";
import idPack from "../public/suggestions/id.json";
import inPack from "../public/suggestions/in.json";
import phPack from "../public/suggestions/ph.json";

export const PACK_SECTIONS: Record<string, SongSection> = {
  br: brPack as SongSection,
  cz: czPack as SongSection,
  de: dePack as SongSection,
  fr: frPack as SongSection,
  id: idPack as SongSection,
  in: inPack as SongSection,
  ph: phPack as SongSection,
};

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

// One song has several keys in principle, since a tap carries the room's
// filters. Only the default combination is catalogued; a tap under changed
// filters just searches the old way, so only the saving depends on this.
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

/** Built once per instance. */
export function suggestionCatalog(): Map<string, CatalogEntry> {
  if (cached) return cached;
  const entries = [
    ...SONG_SECTIONS.flatMap((s) => entriesFrom(s, "core")),
    ...Object.entries(PACK_SECTIONS).flatMap(([packId, section]) =>
      entriesFrom(section, packId)
    ),
  ];
  // One entry per key is what makes it the store's natural _id. A song in two
  // categories duplicates; the later wins, and duplicates share a query anyway.
  cached = new Map(entries.map((e) => [e.key, e]));
  return cached;
}

export function catalogEntry(key: string): CatalogEntry | undefined {
  return suggestionCatalog().get(key);
}

/** The default combination the catalog is keyed for. */
export function isCatalogFilters(duration: string, sortBy: string): boolean {
  return duration === CATALOG_DURATION && sortBy === CATALOG_SORT;
}
