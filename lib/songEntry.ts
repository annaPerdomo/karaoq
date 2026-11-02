import type { KaraokeSongDoc } from "./mongodb";
import { buildSearchQuery, searchCacheKey } from "./searchQuery";
import { catalogEntry, type CatalogEntry } from "./suggestionCatalog";
import { songTokens } from "./suggestionMatch";

export type SongOrigin = "pack" | "demand" | "chart";

/** The same builder the catalog uses — never hand-build a song key elsewhere. */
export function songKeyFor(artist: string, title: string): string {
  return searchCacheKey(buildSearchQuery(`${artist} ${title}`.trim(), true));
}

type SongIdentitySource = Pick<
  KaraokeSongDoc,
  "_id" | "title" | "artist" | "nativeTitle" | "nativeArtist" | "origin"
>;

/** Catalog identity where there is one, else a synthesized entry so the harvest
 *  matcher and the unproven-cut pass can treat a promoted song like any other. */
export function entryForSong(song: SongIdentitySource): CatalogEntry {
  const existing = catalogEntry(song._id);
  if (existing) return existing;
  const origin = song.origin ?? "pack";
  // Native-preferred, as the catalog's own entries are keyed (buildSongQuery)
  // and as lib/corpusResolve's songQuery reads a stored song back out.
  const title = song.nativeTitle ?? song.title;
  const artist = song.nativeArtist ?? song.artist;
  return {
    key: song._id,
    query: buildSearchQuery(`${artist} ${title}`.trim(), true),
    title: song.title,
    artist: song.artist,
    ...(song.nativeTitle ? { nativeTitle: song.nativeTitle } : {}),
    ...(song.nativeArtist ? { nativeArtist: song.nativeArtist } : {}),
    packId: origin,
    categoryId: origin,
  };
}

/** Order-independent, dropping the same filler the claim matcher does
 *  (lib/suggestionMatch), for dedupe against a differently-worded title
 *  naming the same song. */
export function songSignature(artist: string, title: string): string {
  return Array.from(new Set(songTokens(`${artist} ${title}`))).sort().join(" ");
}
