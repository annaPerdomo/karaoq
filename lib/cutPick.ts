import { getKaraokeVideosCollection, type KaraokeSongDoc } from "./mongodb";

// Whether a song has a karaoke version people actually sing along to. Every
// YouTube-derived field is read from karaoke_videos here, at request time
// (lib/corpusRead), and only a count leaves this file.

const QUERY_TIMEOUT_MS = 5000;

// The corpus counts an instrumental as a cut (suggestionMatch), but an idea is
// a promise you can sing along: no lyrics on screen, no pick. A title that says
// karaoke or lyrics outright wins over the word "instrumental".
const SINGALONG =
  /karaoke|karaokê|lyric|letra|paroles|songtext|sing[- ]?along|ktv|カラオケ|노래방|卡拉|कराओके/i;
const NO_LYRICS = /instrumental|backing track|off\s*vocal|オフボーカル/i;

export function isSingAlong(videoTitle: string): boolean {
  return SINGALONG.test(videoTitle) || !NO_LYRICS.test(videoTitle);
}

export type PickableSong = Pick<KaraokeSongDoc, "_id" | "cuts">;

/**
 * Each song's most-viewed servable sing-along cut's view count — how many
 * people already sing it. A song with no such cut is absent from the result.
 */
export async function singAlongViews(songs: PickableSong[]): Promise<Map<string, number>> {
  const ids = Array.from(new Set(songs.flatMap((s) => s.cuts ?? [])));
  const views = new Map<string, number>();
  if (ids.length === 0) return views;

  const videos = await getKaraokeVideosCollection();
  const rows = new Map(
    (
      await videos
        .find({ _id: { $in: ids } }, { projection: { title: 1, thumbnailUrl: 1, viewCount: 1 } })
        .maxTimeMS(QUERY_TIMEOUT_MS)
        .toArray()
    ).map((row) => [row._id, row])
  );

  for (const song of songs) {
    // A blank thumbnail is a row only an add wrote — not ours to serve (corpusRead).
    const counts = (song.cuts ?? [])
      .map((id) => rows.get(id))
      .filter((row) => !!row?.thumbnailUrl && isSingAlong(row.title ?? ""))
      .map((row) => row!.viewCount ?? 0);
    if (counts.length > 0) views.set(song._id, Math.max(...counts));
  }
  return views;
}
