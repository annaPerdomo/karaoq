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

import {
  MIN_COUNTRY_ROOM_SONGS,
  computeShelves,
  getShelves,
  isSingAlong,
  rankHot,
  rankRooms,
  type RoomAdd,
} from "../../lib/shelves";

const songs = () => collection("karaoke_songs");
const videos = () => collection("karaoke_videos");
const snapshots = () => collection("chart_snapshots");
const songData = () => collection("youtube_song_data");
const cache = () => collection("suggestion_cache");

const NOW = new Date("2026-10-20T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

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

function seedVideo(id: string, servable = true, title = `Video ${id} karaoke`) {
  videos().seed({
    _id: id,
    title,
    ...(servable ? { thumbnailUrl: `https://i.ytimg.com/vi/${id}/mq.jpg` } : {}),
    durationSeconds: 200,
    sources: {},
    firstSeenAt: NOW,
    refreshedAt: NOW,
  });
}

describe("rankHot", () => {
  it("uses the country's own chart with climbs and new entries", () => {
    const { country, ranked } = rankHot(
      [
        {
          _id: "us",
          fetchedAt: NOW,
          ranks: [
            { key: "b", rank: 2 },
            { key: "a", rank: 1, since: new Date(NOW.getTime() - 2 * DAY) },
            { key: "c", rank: 3, since: new Date(NOW.getTime() - 30 * DAY) },
          ],
          prevRanks: [
            { key: "a", rank: 1 },
            { key: "b", rank: 5 },
            { key: "c", rank: 1 },
          ],
        },
      ],
      "us",
      NOW
    );
    expect(country).toBe("US");
    expect(ranked).toEqual([
      { key: "a", rank: 1, isNew: true },
      { key: "b", rank: 2, climb: 3 },
      { key: "c", rank: 3, climb: -2 },
    ]);
  });

  it("pools every chart by points for a country without one", () => {
    const { country, ranked } = rankHot(
      [
        { _id: "us", fetchedAt: NOW, ranks: [{ key: "a", rank: 1 }, { key: "b", rank: 2 }] },
        { _id: "gb", fetchedAt: NOW, ranks: [{ key: "b", rank: 1 }] },
      ],
      "LK",
      NOW
    );
    expect(country).toBeNull();
    expect(ranked.map((r) => r.key)).toEqual(["b", "a"]);
    expect(ranked[0].rank).toBe(1);
  });
});

describe("rankRooms", () => {
  const add = (songKey: string, roomId: string, country = "US"): RoomAdd => ({
    songKey,
    roomId,
    country,
  });

  it("ranks by distinct rooms and drops a song only one room sang", () => {
    const { ranked } = rankRooms(
      [
        add("solo", "r1"), add("solo", "r1"), add("solo", "r1"),
        add("pair", "r1"), add("pair", "r2"),
        add("trio", "r1"), add("trio", "r2"), add("trio", "r3"),
      ],
      null
    );
    expect(ranked).toEqual([
      { key: "trio", rooms: 3 },
      { key: "pair", rooms: 2 },
    ]);
  });

  it("falls back to worldwide when the country is too thin", () => {
    const { country, ranked } = rankRooms(
      [add("x", "r1", "DE"), add("x", "r2", "DE"), add("y", "r3", "US"), add("y", "r4", "US")],
      "de"
    );
    expect(country).toBeNull();
    expect(ranked.map((r) => r.key).sort()).toEqual(["x", "y"]);
  });

  it("keeps a country shelf once it has enough songs of its own", () => {
    const adds: RoomAdd[] = [];
    for (let i = 0; i < MIN_COUNTRY_ROOM_SONGS; i++) {
      adds.push(add(`s${i}`, "r1", "PH"), add(`s${i}`, "r2", "PH"));
    }
    adds.push(add("elsewhere", "r8", "US"), add("elsewhere", "r9", "US"));
    const { country, ranked } = rankRooms(adds, "ph");
    expect(country).toBe("PH");
    expect(ranked.map((r) => r.key)).not.toContain("elsewhere");
  });
});

describe("computeShelves", () => {
  it("serves only songs with a servable cut, preferring the Most sung one", async () => {
    seedSong("a", ["a1", "a2"], { topVideoId: "a2" });
    seedSong("b", ["b1"]);
    seedSong("c", []);
    seedSong("d", ["d1"], { retired: true });
    seedVideo("a1");
    seedVideo("a2");
    seedVideo("b1", false);
    seedVideo("d1");
    snapshots().seed({
      _id: "us",
      fetchedAt: NOW,
      ranks: [
        { key: "a", rank: 1 },
        { key: "b", rank: 2 },
        { key: "c", rank: 3 },
        { key: "d", rank: 4 },
      ],
    });

    const shelves = await computeShelves("US", NOW);
    expect(shelves).toHaveLength(1);
    expect(shelves[0]).toMatchObject({ id: "hot", country: "US" });
    expect(shelves[0].songs).toEqual([
      {
        key: "a",
        title: "Title a",
        artist: "Artist a",
        videoId: "a2",
        videoTitle: "Video a2 karaoke",
        thumbnailUrl: "https://i.ytimg.com/vi/a2/mq.jpg",
        durationSeconds: 200,
        rank: 1,
      },
    ]);
  });

  it("builds the rooms shelf from recent adds, minus what the hot shelf shows", async () => {
    seedSong("hit", ["h1"]);
    seedSong("staple", ["s1", "s2"]);
    seedVideo("h1");
    seedVideo("s1");
    snapshots().seed({ _id: "us", fetchedAt: NOW, ranks: [{ key: "hit", rank: 1 }] });
    const recent = new Date(NOW.getTime() - DAY);
    const old = new Date(NOW.getTime() - 30 * DAY);
    const rows = [
      { roomId: "r1", videoId: "s1", timestamp: recent },
      { roomId: "r2", videoId: "s2", timestamp: recent },
      { roomId: "r3", videoId: "h1", timestamp: recent },
      { roomId: "r4", videoId: "h1", timestamp: recent },
      { roomId: "r5", videoId: "unknown", timestamp: recent },
      { roomId: "r6", videoId: "unknown", timestamp: recent },
      { roomId: "r7", videoId: "s1", timestamp: old },
    ];
    rows.forEach((row, i) =>
      songData().seed({ _id: `e${i}`, dataId: `e${i}`, type: "song_added", country: "US", ...row })
    );

    const shelves = await computeShelves("US", NOW);
    const rooms = shelves.find((s) => s.id === "rooms")!;
    expect(rooms.country).toBeNull();
    expect(rooms.songs.map((s) => [s.key, s.rooms])).toEqual([["staple", 2]]);
  });

  it("skips instrumental cuts and untrusted promoted names", async () => {
    seedSong("inst", ["i1", "i2"]);
    seedVideo("i1", true, "Drake - QUEBEC (INSTRUMENTAL)");
    seedVideo("i2", true, "Drake - Quebec (Karaoke Instrumental)");
    seedSong("onlyinst", ["o1"]);
    seedVideo("o1", true, "Future - LIKE ME (Instrumental)");
    seedSong("swapped", ["w1"], { origin: "demand", title: "Michael Jackson", artist: "Thriller" });
    seedVideo("w1");
    seedSong("named", ["n1"], { origin: "demand", artist: "Artist inst" });
    seedVideo("n1");
    snapshots().seed({
      _id: "us",
      fetchedAt: NOW,
      ranks: ["inst", "onlyinst", "swapped", "named"].map((key, i) => ({ key, rank: i + 1 })),
    });

    const [hot] = await computeShelves("US", NOW);
    expect(hot.songs.map((s) => [s.key, s.videoId])).toEqual([
      ["inst", "i2"],
      ["named", "n1"],
    ]);
  });

  it("returns no shelves when nothing is charted or queued", async () => {
    expect(await computeShelves("US", NOW)).toEqual([]);
  });
});

describe("getShelves", () => {
  it("serves a fresh cached copy without recomputing", async () => {
    const cached = [{ id: "hot", country: "US", songs: [] }];
    cache().seed({ _id: "c1", key: "shelves:v1:US", shelves: cached, computedAt: new Date() });
    expect(await getShelves("US")).toEqual(cached);
  });

  it("rechecks a copy with no hot shelf after minutes, not hours", async () => {
    seedSong("a", ["a1"]);
    seedVideo("a1");
    snapshots().seed({ _id: "us", fetchedAt: NOW, ranks: [{ key: "a", rank: 1 }] });
    cache().seed({
      _id: "c1",
      key: "shelves:v1:US",
      shelves: [{ id: "rooms", country: null, songs: [] }],
      computedAt: new Date(Date.now() - 20 * 60 * 1000),
    });

    const shelves = await getShelves("US");
    expect(shelves[0].id).toBe("hot");
  });

  it("recomputes a stale copy", async () => {
    seedSong("a", ["a1"]);
    seedVideo("a1");
    snapshots().seed({ _id: "us", fetchedAt: NOW, ranks: [{ key: "a", rank: 1 }] });
    cache().seed({
      _id: "c1",
      key: "shelves:v1:US",
      shelves: [],
      computedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
    });

    const shelves = await getShelves("US");
    expect(shelves[0].songs.map((s) => s.key)).toEqual(["a"]);
  });
});

describe("isSingAlong", () => {
  it("rejects a bare instrumental but keeps a karaoke one", () => {
    expect(isSingAlong("Song (Instrumental)")).toBe(false);
    expect(isSingAlong("Song | Karaoke Instrumental")).toBe(true);
    expect(isSingAlong("Song (Lyrics)")).toBe(true);
    expect(isSingAlong("Song - Artist")).toBe(true);
  });
});
