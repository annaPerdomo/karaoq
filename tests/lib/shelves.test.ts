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
  MIN_HOT_VIEWS,
  MIN_SHELF_SONGS,
  chartLanguage,
  computeShelves,
  getShelves,
  hotPlans,
  roomPlans,
  type RoomAdd,
} from "../../lib/shelves";
import { isSingAlong } from "../../lib/cutPick";

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

describe("hotPlans", () => {
  it("leads with the country's own chart, its climbs and new entries", () => {
    const main = hotPlans(
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
      null,
      NOW
    );
    expect(main[0]).toMatchObject({ scope: "country", country: "US" });
    expect(main[0].ranked).toEqual([
      { key: "a", rank: 1, isNew: true },
      { key: "b", rank: 2, climb: 3 },
      { key: "c", rank: 3, climb: -2 },
    ]);
    expect(main[main.length - 1].scope).toBe("world");
  });

  it("stands in the language's charts for a country without its own", () => {
    const main = hotPlans([snap("de", ["d"]), snap("us", ["u"])], "CH", "de", NOW);
    expect(main[0]).toMatchObject({ scope: "language", language: "de" });
    expect(main[0].ranked.map((r) => r.key)).toEqual(["d"]);
  });

  it("never lets the UI language outrank the country it's visited from", () => {
    const plans = hotPlans([snap("mx", ["m"]), snap("es", ["e"]), snap("us", ["u"])], "MX", "en", NOW);
    expect(plans.map((p) => p.scope)).toEqual(["country", "language", "world"]);
    expect(plans[1].language).toBe("es");
  });

  it("uses the chosen language when the country is unknown", () => {
    const main = hotPlans([snap("us", ["u"]), snap("de", ["d"])], null, "en", NOW);
    expect(main[0]).toMatchObject({ scope: "language", language: "en" });
  });

  it("pools every chart by points for the worldwide plan", () => {
    const main = hotPlans([snap("us", ["a", "b"]), snap("gb", ["b"])], "LK", null, NOW);
    const world = main[main.length - 1];
    expect(world.scope).toBe("world");
    expect(world.ranked.map((r) => r.key)).toEqual(["b", "a"]);
  });
});

describe("chartLanguage", () => {
  it("maps charts to UI locales, and the rest by hand", () => {
    expect(chartLanguage("mx")).toBe("es");
    expect(chartLanguage("BR")).toBe("pt");
    expect(chartLanguage("tw")).toBe("zh");
    expect(chartLanguage("gb")).toBe("en");
  });
});

describe("roomPlans", () => {
  const add = (songKey: string, roomId: string, country = "US"): RoomAdd => ({
    songKey,
    roomId,
    country,
  });

  it("ranks by distinct rooms and drops a song only one room sang", () => {
    const plans = roomPlans(
      [
        add("solo", "r1"), add("solo", "r1"), add("solo", "r1"),
        add("pair", "r1"), add("pair", "r2"),
        add("trio", "r1"), add("trio", "r2"), add("trio", "r3"),
      ],
      null,
      null
    );
    expect(plans).toHaveLength(1);
    // Shares of the 3 rooms singing, never the counts themselves.
    expect(plans[0].ranked).toEqual([
      { key: "trio", roomShare: 100 },
      { key: "pair", roomShare: 67 },
    ]);
  });

  it("offers country, then language, then every room", () => {
    const plans = roomPlans(
      [add("x", "r1", "MX"), add("x", "r2", "ES"), add("y", "r3", "US"), add("y", "r4", "US")],
      "mx",
      null
    );
    expect(plans.map((p) => p.scope)).toEqual(["country", "language", "world"]);
    expect(plans[0].ranked).toEqual([]);
    expect(plans[1].ranked.map((r) => r.key)).toEqual(["x"]);
    expect(plans[2].ranked.map((r) => r.key).sort()).toEqual(["x", "y"]);
  });
});

describe("roomPlans windows", () => {
  const at = (days: number) => NOW.getTime() - days * DAY;
  const add = (songKey: string, roomId: string, days: number, country = "DE"): RoomAdd => ({
    songKey, roomId, country, at: at(days),
  });

  it("gives a country 30 days of its rooms, and wider lists only the last 14", () => {
    const plans = roomPlans([add("old", "r1", 20), add("old", "r2", 20)], "DE", null, NOW);
    expect(plans[0]).toMatchObject({ scope: "country", windowDays: 30, minSongs: 5 });
    expect(plans[0].ranked.map((r) => r.key)).toEqual(["old"]);
    expect(plans[plans.length - 1]).toMatchObject({ scope: "world", windowDays: 14 });
    expect(plans[plans.length - 1].ranked).toEqual([]);
  });
});

describe("computeShelves", () => {
  it("serves only songs with a servable sing-along cut", async () => {
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

    const shelves = await computeShelves("US", null, NOW);
    expect(shelves).toHaveLength(1);
    expect(shelves[0]).toMatchObject({ id: "hot", country: "US" });
    // Names and keys only: no YouTube field rides along into the cache.
    expect(shelves[0].songs).toEqual([{ key: "a", title: "Title a", artist: "Artist a", rank: 1 }]);
  });

  it("builds the rooms shelf from recent adds, minus what the hot shelf shows", async () => {
    seedSong("hit", ["h1"]);
    seedSong("staple", ["s1", "s2"]);
    seedVideo("h1");
    seedVideo("s1");
    snapshots().seed({ _id: "us", fetchedAt: NOW, ranks: [{ key: "hit", rank: 1 }] });
    const recent = new Date(NOW.getTime() - DAY);
    const old = new Date(NOW.getTime() - 40 * DAY);
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

    const shelves = await computeShelves("US", null, NOW);
    const rooms = shelves.find((s) => s.id === "rooms")!;
    // Thin everywhere, so the narrowest plan keeps it.
    expect(rooms).toMatchObject({ scope: "country", country: "US" });
    // 2 of the 4 rooms whose adds map onto corpus songs.
    expect(rooms.songs.map((s) => [s.key, s.roomShare])).toEqual([["staple", 50]]);
    expect(rooms.songs[0]).not.toHaveProperty("rooms");
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

    const [hot] = await computeShelves("US", null, NOW);
    expect(hot.songs.map((s) => s.key)).toEqual(["inst", "named"]);
  });

  it("lets the public vet a chart hit: too few karaoke views and offensive titles are dropped", async () => {
    seedSong("proven", ["p1", "p2"]);
    seedVideo("p1", true, "Proven (Karaoke)", 6000);
    seedVideo("p2", true, "Proven (Karaoke Version)", 90000);
    seedSong("unsung", ["u1"]);
    seedVideo("u1", true, "Unsung (Karaoke)", MIN_HOT_VIEWS - 1);
    seedSong("censored", ["c1"], { title: "I'M DAT N***A" });
    seedVideo("c1");
    snapshots().seed(snap("us", ["unsung", "censored", "proven"]));

    const [hot] = await computeShelves("US", null, NOW);
    // A single chart keeps Apple's position, which ▲ and the source line refer to.
    expect(hot.songs.map((s) => [s.key, s.rank])).toEqual([["proven", 3]]);
  });

  it("renumbers a pooled list, whose ranks are our own order", async () => {
    seedSong("gap", ["g1"]);
    seedVideo("g1", true, "Gap (Karaoke)", 10);
    ["p", "q"].forEach((key) => {
      seedSong(key, [`${key}1`]);
      seedVideo(`${key}1`);
    });
    snapshots().seed(snap("us", ["gap", "p"]));
    snapshots().seed(snap("gb", ["gap", "q"]));

    const [hot] = await computeShelves("LK", "en", NOW);
    expect(hot.chartCountries).toEqual(["US", "GB"]);
    expect(hot.songs.map((s) => s.rank)).toEqual([1, 2]);
  });

  it("widens a too-thin country chart to the language's charts", async () => {
    seedSong("own", ["o1"]);
    seedVideo("o1");
    snapshots().seed(snap("cz", ["own"]));
    const keys = Array.from({ length: 8 }, (_, i) => `en${i}`);
    keys.forEach((key, i) => {
      seedSong(key, [`v${i}`]);
      seedVideo(`v${i}`);
    });
    snapshots().seed(snap("us", keys));

    const [hot] = await computeShelves("CZ", "en", NOW);
    expect(hot).toMatchObject({ scope: "world" });
    expect(hot.songs).toHaveLength(9);
  });

  it("says where a chart shelf came from and when", async () => {
    seedSong("a", ["a1"]);
    seedVideo("a1");
    snapshots().seed(snap("us", ["a"]));

    const [hot] = await computeShelves("US", null, NOW);
    expect(hot).toMatchObject({ chartCountries: ["US"], updatedAt: NOW.toISOString() });
  });

  it("keeps a country's own rooms list at five songs, and says it counted 30 days", async () => {
    const keys = ["k0", "k1", "k2", "k3", "k4"];
    keys.forEach((key, i) => {
      seedSong(key, [`kv${i}`]);
      seedVideo(`kv${i}`);
      ["ra", "rb"].forEach((room, j) =>
        songData().seed({ _id: `${key}${j}`, dataId: `${key}${j}`, type: "song_added", country: "FR",
          roomId: room, videoId: `kv${i}`, timestamp: new Date(NOW.getTime() - 20 * DAY) })
      );
    });

    const rooms = (await computeShelves("FR", null, NOW)).find((sh) => sh.id === "rooms")!;
    expect(rooms).toMatchObject({ scope: "country", country: "FR", windowDays: 30 });
    expect(rooms.songs).toHaveLength(5);
  });

  it("returns no shelves when nothing is charted or queued", async () => {
    expect(await computeShelves("US", null, NOW)).toEqual([]);
  });
});

describe("getShelves", () => {
  it("serves a fresh cached copy without recomputing", async () => {
    const cached = [{ id: "hot", scope: "country", country: "US", language: null, songs: [] }];
    cache().seed({ _id: "c1", key: "shelves:v8:US:-", shelves: cached, computedAt: new Date() });
    expect(await getShelves("US")).toEqual(cached);
  });

  it("rechecks a copy with no hot shelf after minutes, not hours", async () => {
    seedSong("a", ["a1"]);
    seedVideo("a1");
    snapshots().seed({ _id: "us", fetchedAt: NOW, ranks: [{ key: "a", rank: 1 }] });
    cache().seed({
      _id: "c1",
      key: "shelves:v8:US:-",
      shelves: [{ id: "rooms", scope: "world", country: null, language: null, songs: [] }],
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
      key: "shelves:v8:US:-",
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

