import { describe, it, expect } from "vitest";

import {
  suggestionCatalog,
  catalogEntry,
  isCatalogFilters,
  PACK_SECTIONS,
} from "../../lib/suggestionCatalog";
import {
  LANGUAGE_PACKS,
  SONG_SECTIONS,
  buildSongQuery,
} from "../../app/queue/songSuggestions";
import { buildSearchQuery, searchCacheKey } from "../../lib/searchQuery";

describe("suggestionCatalog", () => {
  it("covers every built-in section and every language pack", () => {
    // The whole saving rests on the server recognising a tap on sight, so a
    // song missing from here is a song that keeps costing a search forever.
    const catalog = suggestionCatalog();
    const everySong = [
      ...SONG_SECTIONS.flatMap((s) => s.categories.flatMap((c) => c.songs)),
      ...Object.values(PACK_SECTIONS).flatMap((s) =>
        s.categories.flatMap((c) => c.songs)
      ),
    ];
    expect(everySong.length).toBeGreaterThan(800);

    const missing = everySong.filter(
      (song) => !catalog.has(searchCacheKey(buildSearchQuery(buildSongQuery(song), true)))
    );
    expect(missing.map((s) => `${s.artist} — ${s.title}`)).toEqual([]);
  });

  it("imports a section for every pack the client can load", () => {
    // The packs are imported one by one, so adding an eighth to LANGUAGE_PACKS
    // without importing it would silently leave that language uncatalogued.
    const imported = Object.keys(PACK_SECTIONS).sort();
    const offered = LANGUAGE_PACKS.map((p) => p.packId).sort();
    expect(imported).toEqual(offered);
  });

  it("recognises the query a tap actually produces", () => {
    const song = SONG_SECTIONS[0].categories[0].songs[0];
    // Exactly what useDiscoveryBrowse sends: buildSongQuery, then the karaoke
    // suffix, then the server's own normalisation.
    const tapped = buildSearchQuery(buildSongQuery(song), true);
    const entry = catalogEntry(searchCacheKey(tapped));

    expect(entry).toBeDefined();
    expect(entry!.title).toBe(song.title);
    expect(entry!.packId).toBe("core");
  });

  it("keys a pack song to its own pack, not to core", () => {
    const idPack = PACK_SECTIONS.id;
    const song = idPack.categories[0].songs[0];
    const entry = catalogEntry(
      searchCacheKey(buildSearchQuery(buildSongQuery(song), true))
    );

    expect(entry?.packId).toBe("id");
    expect(entry?.categoryId).toBe(idPack.categories[0].id);
  });

  it("keys native-script songs by what would actually be searched", () => {
    // buildSongQuery prefers the native title, so a catalog keyed off the
    // romanisation would never match the tap that uses the native one.
    const withNative = Object.values(PACK_SECTIONS)
      .flatMap((s) => s.categories.flatMap((c) => c.songs))
      .find((s) => s.nativeTitle);
    if (!withNative) return;

    const entry = catalogEntry(
      searchCacheKey(buildSearchQuery(buildSongQuery(withNative), true))
    );
    expect(entry).toBeDefined();
  });

  it("leaves an ordinary typed search out of the catalog", () => {
    expect(catalogEntry(searchCacheKey("my mate dave singing badly"))).toBeUndefined();
  });

  it("only claims the default filter combination", () => {
    // A tap under changed filters searches the old way; the catalog is keyed
    // for one combination and must not answer for another.
    expect(isCatalogFilters("any", "relevance")).toBe(true);
    expect(isCatalogFilters("short", "relevance")).toBe(false);
    expect(isCatalogFilters("any", "viewCount")).toBe(false);
  });
});
