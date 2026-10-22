import { getKaraokeSongsCollection, type KaraokeSongDoc } from "./mongodb";
import { hasSearchOperators, searchCacheKey } from "./searchQuery";
import { songKeyFor } from "./songEntry";

const FILLER_TOKENS = new Set([
  "karaoke",
  "lyrics",
  "instrumental",
  "version",
  "cover",
]);

export function queryTokens(query: string): string[] {
  const tokens = searchCacheKey(query)
    .split(" ")
    .filter((token) => token.length > 0 && !FILLER_TOKENS.has(token));
  return Array.from(new Set(tokens));
}

function signatureOf(text: string): string {
  return queryTokens(text).sort().join(" ");
}

export interface SongIndex {
  lookup(query: string): string | null;
}

type IndexableSong = Pick<
  KaraokeSongDoc,
  "_id" | "title" | "artist" | "nativeTitle" | "nativeArtist" | "cuts" | "addCount" | "demand"
>;

interface IndexEntry {
  songId: string;
  score: number;
  strong: boolean;
}

export function buildSongIndex(songs: IndexableSong[]): SongIndex {
  const bySignature = new Map<string, IndexEntry>();

  function register(signature: string, songId: string, score: number, strong: boolean): void {
    if (!signature) return;
    const existing = bySignature.get(signature);
    if (!existing) {
      bySignature.set(signature, { songId, score, strong });
      return;
    }
    if (strong !== existing.strong) {
      if (strong) bySignature.set(signature, { songId, score, strong });
      return;
    }
    if (score > existing.score) bySignature.set(signature, { songId, score, strong });
  }

  for (const song of songs) {
    if ((song.cuts?.length ?? 0) === 0) continue;
    const score = (song.addCount ?? 0) + (song.demand ?? 0);
    const title = song.title ?? "";
    const artist = song.artist ?? "";
    const pairs: [string, string][] = [[artist, title]];
    if (song.nativeArtist || song.nativeTitle) {
      pairs.push([song.nativeArtist ?? artist, song.nativeTitle ?? title]);
    }
    for (const [pairArtist, pairTitle] of pairs) {
      const titleTokens = queryTokens(pairTitle);
      if (titleTokens.length === 0) continue;
      register(signatureOf(`${pairArtist} ${pairTitle}`), song._id, score, true);
      if (titleTokens.length >= 2 || titleTokens.join("").length >= 5) {
        register(signatureOf(pairTitle), song._id, score, false);
      }
    }
  }

  return {
    lookup(query: string): string | null {
      const signature = signatureOf(query);
      if (!signature) return null;
      return bySignature.get(signature)?.songId ?? null;
    },
  };
}

interface CachedIndex {
  index: SongIndex;
  builtAt: number;
}

const INDEX_TTL_MS = 10 * 60 * 1000;

let cached: CachedIndex | null = null;
let building: Promise<SongIndex> | null = null;

/** Test seam: module state outlives a `vi.clearAllMocks()`. */
export function resetSongIndexCache(): void {
  cached = null;
  building = null;
}

async function buildIndexFromDb(): Promise<SongIndex> {
  const songs = await getKaraokeSongsCollection();
  const rows = await songs
    .find(
      { "cuts.0": { $exists: true }, retired: { $ne: true } },
      {
        projection: {
          title: 1,
          artist: 1,
          nativeTitle: 1,
          nativeArtist: 1,
          cuts: 1,
          addCount: 1,
          demand: 1,
        },
      }
    )
    .toArray();
  return buildSongIndex(rows);
}

export async function getSongIndex(): Promise<SongIndex> {
  const now = Date.now();
  if (cached && now - cached.builtAt < INDEX_TTL_MS) return cached.index;
  if (!building) {
    building = buildIndexFromDb()
      .then((index) => {
        cached = { index, builtAt: Date.now() };
        return index;
      })
      .finally(() => {
        building = null;
      });
  }
  return building;
}

export async function findSongForQuery(query: string): Promise<string | null> {
  if (hasSearchOperators(query)) return null;
  try {
    const songs = await getKaraokeSongsCollection();
    const exactKey = songKeyFor("", query);
    const exact = await songs.findOne(
      { _id: exactKey, retired: { $ne: true } },
      { projection: { cuts: 1 } }
    );
    if ((exact?.cuts?.length ?? 0) > 0) return exactKey;
    const index = await getSongIndex();
    return index.lookup(query);
  } catch {
    return null;
  }
}
