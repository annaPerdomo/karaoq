import {
  getKaraokeSongsCollection,
  getKaraokeVideosCollection,
  type KaraokeVideoDoc,
} from "./mongodb";
import type { SearchResult } from "./searchCache";

// Every YouTube-derived field is assembled here at read time: denormalising one
// onto karaoke_songs would put it outside the 30-day TTL (lib/mongodb).

export interface ResolvedResult extends SearchResult {
  pinned?: boolean;
}

export function hydrateVideo(row: KaraokeVideoDoc): SearchResult {
  return {
    videoId: row._id,
    title: row.title,
    thumbnailUrl: row.thumbnailUrl,
    ...(row.durationSeconds !== undefined
      ? { durationSeconds: row.durationSeconds }
      : {}),
    ...(row.viewCount !== undefined ? { viewCount: row.viewCount } : {}),
  };
}

export function pinTopFirst(
  results: SearchResult[],
  topVideoId?: string
): ResolvedResult[] {
  const top = topVideoId
    ? results.find((r) => r.videoId === topVideoId)
    : undefined;
  if (!top) return results;
  return [
    { ...top, pinned: true },
    ...results.filter((r) => r.videoId !== top.videoId),
  ];
}

/** Null — never a throw — when the song is unknown, holds nothing, or the store
 *  fails: a browse tap must degrade to the search it always ran, not to an error.
 *  One cut is enough: suggestion_videos' floor of ten worked only because a short
 *  answer bought a search that overwrote it (THIN_CUTS, lib/songCorpus). */
export async function readSongCuts(
  songKey: string
): Promise<ResolvedResult[] | null> {
  try {
    const songs = await getKaraokeSongsCollection();
    const song = await songs.findOne(
      { _id: songKey },
      { projection: { cuts: 1, topVideoId: 1 } }
    );
    const cuts = song?.cuts ?? [];
    if (!song || cuts.length === 0) return null;

    const videos = await getKaraokeVideosCollection();
    const rows = new Map(
      (
        await videos
          .find(
            { _id: { $in: cuts } },
            {
              projection: {
                title: 1,
                thumbnailUrl: 1,
                durationSeconds: 1,
                viewCount: 1,
              },
            }
          )
          .toArray()
      ).map((row) => [row._id, row])
    );
    // The cuts array is the ranking, and karaoke_songs has no TTL: an id can
    // outlive its video row by a night.
    // A blank thumbnail is a row only an add wrote (writeAdd, lib/songCorpus) —
    // a client-typed title and no picture, so it isn't ours to serve yet.
    const hydrated = cuts
      .filter((id) => !!rows.get(id)?.thumbnailUrl)
      .map((id) => hydrateVideo(rows.get(id)!));
    if (hydrated.length === 0) return null;

    return pinTopFirst(hydrated, song.topVideoId);
  } catch {
    return null;
  }
}
