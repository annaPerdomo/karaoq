import { getKaraokeSongsCollection, getKaraokeVideosCollection } from "./mongodb";

export interface CorpusSongRef {
  artist: string;
  title: string;
}

export async function lookupCorpusSong(videoId: string): Promise<CorpusSongRef | null> {
  try {
    const videos = await getKaraokeVideosCollection();
    const video = await videos.findOne(
      { _id: videoId },
      { projection: { songKeys: 1 } }
    );
    const songKey = video?.songKeys?.[0];
    if (!songKey) return null;

    const songs = await getKaraokeSongsCollection();
    const song = await songs.findOne(
      { _id: songKey },
      { projection: { artist: 1, title: 1 } }
    );
    if (!song) return null;

    return { artist: song.artist, title: song.title };
  } catch {
    return null;
  }
}
