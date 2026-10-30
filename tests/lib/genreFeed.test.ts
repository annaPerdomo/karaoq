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

import { CHART_COUNTRIES } from "../../lib/chartCountries";
import { GENRE_CHART_IDS, GENRES, PLACE_GENRES, storeFor } from "../../lib/genreCharts";
import {
  GENRE_CHARTS_PER_RUN,
  GENRE_INSERT_TOP,
  feedGenreCharts,
  fetchGenreChart,
  genreChartUrl,
} from "../../lib/genreFeed";
import { ChartFeedError } from "../../lib/chartFeed";

const songs = () => collection("karaoke_songs");
const cronState = () => collection("cron_state");
const genreSnapshots = () => collection("genre_snapshots");
const chartSnapshots = () => collection("chart_snapshots");

beforeEach(() => {
  collections.forEach((c) => c.clear());
});

const soon = () => Date.now() + 30_000;
const NOW = new Date("2026-10-30T04:15:00Z");

function entry(title: string, artist: string) {
  return { "im:name": { label: title }, "im:artist": { label: artist } };
}

function rssResponse(entries: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => ({ feed: entries === undefined ? {} : { entry: entries } }),
  } as Response;
}

function stubFetch(byChart: Record<string, ReturnType<typeof rssResponse> | Error>) {
  return vi.fn(async (url: string) => {
    const id = Object.keys(byChart).find((chartId) => genreChartUrl(chartId) === url);
    const res = id ? byChart[id] : rssResponse([]);
    if (res instanceof Error) throw res;
    return res;
  }) as unknown as typeof fetch;
}

describe("genre definitions", () => {
  it("names only real genres, for charted places", () => {
    for (const place of Object.keys(PLACE_GENRES)) {
      expect(CHART_COUNTRIES as readonly string[], place).toContain(place);
      for (const slug of PLACE_GENRES[place]) expect(GENRES[slug], `${place}:${slug}`).toBeTruthy();
      expect(new Set(PLACE_GENRES[place]).size).toBe(PLACE_GENRES[place].length);
    }
  });

  it("reads Korea's genres from the US store, everyone else's from their own", () => {
    expect(storeFor("kr")).toBe("us");
    expect(storeFor("JP")).toBe("jp");
    expect(genreChartUrl("kr:trot")).toBe(
      "https://itunes.apple.com/us/rss/topsongs/limit=50/genre=1261/json"
    );
  });
});

describe("fetchGenreChart", () => {
  it("parses the RSS entries into ranked songs credited to the store", async () => {
    const fetchImpl = stubFetch({
      "jp:anime": rssResponse([entry("紅蓮華", "LiSA"), entry("アイドル", "YOASOBI")]),
    });

    const chart = await fetchGenreChart("jp:anime", fetchImpl, 5000);

    expect(chart).toEqual([
      { artist: "LiSA", title: "紅蓮華", country: "jp", rank: 1 },
      { artist: "YOASOBI", title: "アイドル", country: "jp", rank: 2 },
    ]);
  });

  it("takes a lone entry sent as an object, and an empty chart as no songs", async () => {
    const fetchImpl = stubFetch({
      "jp:enka": rssResponse(entry("天城越え", "石川さゆり")),
      "jp:kayokyoku": rssResponse(undefined),
    });

    expect(await fetchGenreChart("jp:enka", fetchImpl, 5000)).toHaveLength(1);
    expect(await fetchGenreChart("jp:kayokyoku", fetchImpl, 5000)).toEqual([]);
  });

  it("drops rows nobody sings and strips version tags, keeping Apple's ranks", async () => {
    const fetchImpl = stubFetch({
      "br:pagode": rssResponse([
        entry("Jailer 2 Theme", "Anirudh"),
        entry("Dependente (Ao Vivo)", "Sorriso Maroto"),
        entry("STRUCT (Slowed)", "UdieNnx"),
        entry("Hey (Single Version)", "Someone"),
      ]),
    });

    const chart = await fetchGenreChart("br:pagode", fetchImpl, 5000);

    expect(chart.map((r) => [r.title, r.rank])).toEqual([
      ["Dependente", 2],
      ["Hey", 4],
    ]);
  });

  it("throws ChartFeedError on a non-2xx response", async () => {
    const fetchImpl = stubFetch({ "jp:anime": rssResponse([], false, 502) });
    await expect(fetchGenreChart("jp:anime", fetchImpl, 5000)).rejects.toBeInstanceOf(ChartFeedError);
  });
});

describe("feedGenreCharts", () => {
  it("adds new chart songs, snapshots the genre apart from the Top 50, and stamps it", async () => {
    songs().seed({
      _id: "known",
      title: "Gurenge",
      artist: "LiSA",
      nativeTitle: "紅蓮華",
      cuts: ["v1"],
      addCount: 0,
      addsByCountry: {},
      demand: 0,
    });
    // Every other chart fresh, so this run is due only Japan's anime chart.
    for (const id of GENRE_CHART_IDS) {
      if (id !== "jp:anime") cronState().seed({ _id: `genre:${id}`, fetchedAt: NOW });
    }
    const fetchImpl = stubFetch({
      "jp:anime": rssResponse([entry("紅蓮華", "LiSA"), entry("残酷な天使のテーゼ", "高橋洋子")]),
    });

    const { report } = await feedGenreCharts(soon(), NOW, fetchImpl);

    expect(report.added).toBe(1);
    expect(report.alreadyKnown).toBe(1);
    const added = songs().all().find((s) => s._id !== "known")!;
    expect(added).toMatchObject({
      artist: "高橋洋子",
      origin: "chart",
      chartCountries: ["jp"],
      cuts: [],
      genreChart: true,
    });
    const snap = genreSnapshots().get("jp:anime");
    expect(snap.ranks.map((r: { key: string }) => r.key)).toEqual(["known", added._id]);
    expect(chartSnapshots().all()).toHaveLength(0);
    expect(cronState().get("genre:jp:anime")).toMatchObject({ fetchedAt: NOW });
  });

  it("only lets a chart's top add songs; the tail ranks known ones", async () => {
    songs().seed({
      _id: "tail-known",
      title: "Known Tail",
      artist: "Someone",
      cuts: ["v1"],
      addCount: 0,
      addsByCountry: {},
      demand: 0,
    });
    const rows = Array.from({ length: GENRE_INSERT_TOP + 5 }, (_, i) =>
      i === GENRE_INSERT_TOP + 2 ? entry("Known Tail", "Someone") : entry(`Song ${i}`, `Artist ${i}`)
    );
    const fetchImpl = stubFetch({ "us:pop": rssResponse(rows) });

    const { report } = await feedGenreCharts(soon(), NOW, fetchImpl);

    expect(report.added).toBe(GENRE_INSERT_TOP);
    const ranks = genreSnapshots().get("us:pop").ranks;
    expect(ranks).toHaveLength(GENRE_INSERT_TOP + 1);
    expect(ranks[ranks.length - 1]).toMatchObject({ key: "tail-known", rank: GENRE_INSERT_TOP + 3 });
  });

  it("fetches at most a run's share of charts, oldest first, and leaves the rest due", async () => {
    const fetchImpl = stubFetch({});

    const first = await feedGenreCharts(soon(), NOW, fetchImpl);
    expect(first.report.fetched).toBe(GENRE_CHARTS_PER_RUN);
    expect(first.report.countries).toEqual(GENRE_CHART_IDS.slice(0, GENRE_CHARTS_PER_RUN));

    const second = await feedGenreCharts(soon(), NOW, fetchImpl);
    expect(second.report.countries[0]).toBe(GENRE_CHART_IDS[GENRE_CHARTS_PER_RUN]);
  });

  it("stamps a failed chart so it sits out instead of blocking the run", async () => {
    const fetchImpl = stubFetch({ "us:pop": new Error("boom") });

    const { report } = await feedGenreCharts(soon(), NOW, fetchImpl);

    expect(report.errors.map((e) => e.country)).toContain("us:pop");
    expect(cronState().get("genre:us:pop")).toMatchObject({ failedAt: NOW });
    expect(genreSnapshots().get("us:pop")).toBeNull();
  });
});
