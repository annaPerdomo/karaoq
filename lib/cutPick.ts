import {
  getKaraokeSongsCollection,
  getKaraokeVideosCollection,
  type KaraokeSongDoc,
} from "./mongodb";
import type { CutPreview } from "./shelfTypes";

// Which of a song's corpus cuts an idea opens on. Every YouTube-derived field
// is read from karaoke_videos here, at request time (lib/corpusRead).

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

export type PickableSong = Pick<KaraokeSongDoc, "_id" | "cuts" | "topVideoId">;

export interface PickedCut extends CutPreview {
  /** The most-viewed sing-along cut's count: how many people already sing it. */
  bestViews: number;
}

/**
 * The cut rooms converged on ("Most sung") when it's a sing-along one, else
 * the most-viewed sing-along cut — the public has already vetted it. Songs with
 * no servable sing-along cut are absent from the result.
 */
export async function pickCuts(songs: PickableSong[]): Promise<Map<string, PickedCut>> {
  const ids = Array.from(new Set(songs.flatMap((s) => s.cuts ?? [])));
  const picked = new Map<string, PickedCut>();
  if (ids.length === 0) return picked;

  const videos = await getKaraokeVideosCollection();
  const rows = new Map(
    (
      await videos
        .find(
          { _id: { $in: ids } },
          { projection: { title: 1, thumbnailUrl: 1, durationSeconds: 1, viewCount: 1 } }
        )
        .maxTimeMS(QUERY_TIMEOUT_MS)
        .toArray()
    ).map((row) => [row._id, row])
  );

  for (const song of songs) {
    // A blank thumbnail is a row only an add wrote — not ours to serve (corpusRead).
    const singable = (song.cuts ?? [])
      .map((id) => rows.get(id))
      .filter((row): row is NonNullable<typeof row> =>
        !!row?.thumbnailUrl && isSingAlong(row.title ?? "")
      );
    if (singable.length === 0) continue;
    const byViews = singable.slice().sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0));
    const chosen = singable.find((row) => row._id === song.topVideoId) ?? byViews[0];
    picked.set(song._id, {
      videoId: chosen._id,
      videoTitle: chosen.title,
      thumbnailUrl: chosen.thumbnailUrl,
      ...(chosen.durationSeconds !== undefined
        ? { durationSeconds: chosen.durationSeconds }
        : {}),
      bestViews: byViews[0].viewCount ?? 0,
    });
  }
  return picked;
}

/** Previews for songs by key, for lists whose names we already have. */
export async function previewsFor(keys: string[]): Promise<Record<string, CutPreview>> {
  if (keys.length === 0) return {};
  const songs = await getKaraokeSongsCollection();
  const docs = await songs
    .find(
      { _id: { $in: keys }, retired: { $ne: true } },
      { projection: { cuts: 1, topVideoId: 1 } }
    )
    .maxTimeMS(QUERY_TIMEOUT_MS)
    .toArray();
  const picked = await pickCuts(docs);
  const out: Record<string, CutPreview> = {};
  picked.forEach(({ bestViews: _views, ...preview }, key) => {
    out[key] = preview;
  });
  return out;
}
