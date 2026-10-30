import { describe, it, expect, beforeEach, vi } from "vitest";
import { fakeCollection, type FakeCollection } from "../helpers/fakeCollection";

const collections = new Map<string, FakeCollection>();

function collection(name: string): FakeCollection {
  if (!collections.has(name)) collections.set(name, fakeCollection());
  return collections.get(name)!;
}

vi.mock("mongodb", () => ({
  MongoClient: function () {
    return {
      connect: vi.fn(),
      close: vi.fn(),
      db: () => ({
        collection: (name: string) => collection(name),
        command: vi.fn(async () => ({})),
      }),
    };
  },
}));

process.env.MONGODB_URI = "mongodb://test";
process.env.MONGODB_DB = "test-db";

import { MIN_HOT_VIEWS } from "../../lib/shelves";
import { MIN_GENRE_SONGS, computeGenreShelves, getGenreShelves } from "../../lib/genreShelves";
import { PLACE_GENRES } from "../../lib/genreCharts";

const songs = () => collection("karaoke_songs");
const videos = () => collection("karaoke_videos");
const genreSnapshots = () => collection("genre_snapshots");
const cache = () => collection("suggestion_cache");

const NOW = new Date("2026-10-20T12:00:00Z");

beforeEach(() => {
  collections.forEach((c) => c.clear());
});

function seedSong(key: string, cuts: string[], extra: Record<string, unknown> = {}) {
  songs().seed({
    _id: key,
    title: `Title ${key}`,
    artist: `Artist ${key}`,
    cuts,
    addCount: 0,
    addsByCountry: {},
    demand: 0,
    ...extra,
  });
}

function seedVideo(
  id: string,
  servable = true,
  title = `Video ${id} karaoke`,
  viewCount = MIN_HOT_VIEWS
) {
  videos().seed({
    _id: id,
    title,
    ...(servable ? { thumbnailUrl: `https://i.ytimg.com/vi/${id}/mq.jpg` } : {}),
    durationSeconds: 200,
    viewCount,
    sources: {},
    firstSeenAt: NOW,
    refreshedAt: NOW,
  });
}

const snap = (id: string, keys: string[], extra: Record<string, unknown> = {}) => ({
  _id: id,
  fetchedAt: NOW,
  ranks: keys.map((key, i) => ({ key, rank: i + 1 })),
  ...extra,
});

function seedChart(id: string, prefix: string, count: number) {
  const ranks = Array.from({ length: count }, (_, i) => {
    seedSong(`${prefix}${i}`, [`${prefix}${i}v`]);
    seedVideo(`${prefix}${i}v`);
    return { key: `${prefix}${i}`, rank: i + 1 };
  });
  genreSnapshots().seed({ _id: id, fetchedAt: NOW, ranks });
}

describe("computeGenreShelves", () => {
  it("serves the place's genres in its own order, each from its own chart", async () => {
    seedChart("jp:jpop", "p", MIN_GENRE_SONGS);
    seedChart("jp:anime", "a", MIN_GENRE_SONGS + 1);

    const genres = await computeGenreShelves("JP", NOW);

    expect(genres.map((g) => g.slug)).toEqual(["anime", "jpop"]);
    expect(genres[0]).toMatchObject({
      name: "Anime",
      country: "JP",
      store: "JP",
      updatedAt: NOW.toISOString(),
    });
    expect(genres[0].songs[0]).toEqual({ key: "a0", title: "Title a0", artist: "Artist a0", rank: 1 });
    expect(genres[0].songs).toHaveLength(MIN_GENRE_SONGS + 1);
  });

  it("drops songs nobody has shown they can sing, and a genre left too thin", async () => {
    seedChart("us:pop", "p", MIN_GENRE_SONGS);
    seedSong("quiet", ["quiet-v"]);
    seedVideo("quiet-v", true, "Quiet karaoke", MIN_HOT_VIEWS - 1);
    seedChart("us:country", "c", MIN_GENRE_SONGS - 1);
    genreSnapshots().seed({
      _id: "us:pop",
      fetchedAt: NOW,
      ranks: [{ key: "quiet", rank: 1 }].concat(
        Array.from({ length: MIN_GENRE_SONGS }, (_, i) => ({ key: `p${i}`, rank: i + 2 }))
      ),
    });

    const genres = await computeGenreShelves("us", NOW);

    expect(genres.map((g) => g.slug)).toEqual(["pop"]);
    expect(genres[0].songs.map((s) => s.key)).not.toContain("quiet");
    // Apple's ranks, gaps and all: the source line names Apple's chart.
    expect(genres[0].songs[0].rank).toBe(2);
  });

  it("credits Korea's genres to the US store they come from", async () => {
    seedChart("kr:trot", "t", MIN_GENRE_SONGS);
    const genres = await computeGenreShelves("KR", NOW);
    expect(genres[0]).toMatchObject({ slug: "trot", country: "KR", store: "US" });
  });

  it("returns nothing for a place without genre charts", async () => {
    expect(PLACE_GENRES["zz"]).toBeUndefined();
    expect(await computeGenreShelves("ZZ", NOW)).toEqual([]);
  });
});

describe("getGenreShelves", () => {
  it("serves a fresh cached copy without recomputing", async () => {
    const cached = [{ slug: "anime", name: "Anime", emoji: "⚔️", country: "JP", store: "JP", songs: [] }];
    cache().seed({ _id: "c1", key: "genres:v1:JP", genres: cached, computedAt: new Date() });
    seedChart("jp:anime", "a", MIN_GENRE_SONGS);

    expect(await getGenreShelves("jp")).toEqual(cached);
  });

  it("rechecks an empty copy after minutes, not hours", async () => {
    cache().seed({
      _id: "c1",
      key: "genres:v1:JP",
      genres: [],
      computedAt: new Date(Date.now() - 20 * 60 * 1000),
    });
    seedChart("jp:anime", "a", MIN_GENRE_SONGS);

    const genres = await getGenreShelves("jp");

    expect(genres.map((g) => g.slug)).toEqual(["anime"]);
  });
});
