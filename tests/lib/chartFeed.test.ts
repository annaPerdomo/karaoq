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
  CHART_COUNTRIES,
  CHART_COUNTRIES_PER_RUN,
  CHART_NEW_SONGS_PER_RUN,
  cleanChartArtist,
  cleanChartTitle,
  ChartFeedError,
  feedCharts,
  fetchChart,
  nextSnapshot,
} from "../../lib/chartFeed";

const songs = () => collection("karaoke_songs");
const cronState = () => collection("cron_state");
const snapshots = () => collection("chart_snapshots");

beforeEach(() => {
  collections.forEach((c) => c.clear());
});

const soon = () => Date.now() + 30_000;

function chartResponse(results: { name: string; artistName: string }[], ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => ({ feed: { results } }),
  } as Response;
}

function stubFetch(byCountry: Record<string, ReturnType<typeof chartResponse> | Error>) {
  return vi.fn(async (url: string) => {
    const country = CHART_COUNTRIES.find((cc) => url.indexOf(`/${cc}/`) >= 0)!;
    // A country the test doesn't name charts nothing.
    const res = byCountry[country] ?? chartResponse([]);
    if (res instanceof Error) throw res;
    return res;
  }) as unknown as typeof fetch;
}

describe("cleanChartTitle", () => {
  it("drops a feat. credit", () => {
    expect(cleanChartTitle("Die With A Smile (feat. Bruno Mars)")).toBe("Die With A Smile");
  });

  it("drops a From “…” credit", () => {
    expect(cleanChartTitle("Golden (From “KPop Demon Hunters”)")).toBe("Golden");
  });

  it("drops a trailing Remastered tag", () => {
    expect(cleanChartTitle("Hey Jude - Remastered 2015")).toBe("Hey Jude");
  });

  it("leaves a with-credit in the title alone", () => {
    expect(cleanChartTitle("Love Me (With All Your Heart)")).toBe("Love Me (With All Your Heart)");
  });

  it("leaves a hyphenated word with no spaces around the dash alone", () => {
    expect(cleanChartTitle("Re-Live")).toBe("Re-Live");
  });
});

describe("cleanChartArtist", () => {
  it("keeps the full credit through an ampersand", () => {
    expect(cleanChartArtist("Lady Gaga & Bruno Mars")).toBe("Lady Gaga & Bruno Mars");
  });

  it("keeps an act whose own name has an ampersand", () => {
    expect(cleanChartArtist("Earth, Wind & Fire")).toBe("Earth, Wind & Fire");
  });

  it("keeps an act whose own name has a comma-joined pair", () => {
    expect(cleanChartArtist("Henrique & Juliano")).toBe("Henrique & Juliano");
  });

  it("drops a featuring credit", () => {
    expect(cleanChartArtist("Zach Bryan feat. Lana Del Rey")).toBe("Zach Bryan");
  });
});

describe("fetchChart", () => {
  it("parses feed.results into ranked songs", async () => {
    const fetchImpl = stubFetch({
      us: chartResponse([
        { name: "Song A", artistName: "Artist A" },
        { name: "Song B", artistName: "Artist B" },
      ]),
    });

    const chart = await fetchChart("us", fetchImpl);

    expect(chart).toEqual([
      { artist: "Artist A", title: "Song A", country: "us", rank: 1 },
      { artist: "Artist B", title: "Song B", country: "us", rank: 2 },
    ]);
  });

  it("throws ChartFeedError on a non-2xx response", async () => {
    const fetchImpl = stubFetch({ us: chartResponse([], false, 503) });

    await expect(fetchChart("us", fetchImpl)).rejects.toBeInstanceOf(ChartFeedError);
  });
});

describe("feedCharts", () => {
  it("adds new cutless chart songs and skips one matching a pack song", async () => {
    songs().seed({
      _id: "pack-song",
      title: "Shape of You",
      artist: "Ed Sheeran",
      cuts: ["v1"],
      addCount: 0,
      addsByCountry: {},
      demand: 0,
    });

    const fetchImpl = stubFetch({
      us: chartResponse([
        // Different word order of the pack song above.
        { name: "Ed Sheeran", artistName: "Shape of You" },
        { name: "New Hit", artistName: "New Artist" },
      ]),
      gb: chartResponse([]),
      ph: chartResponse([]),
      de: chartResponse([]),
    });

    const { done, report } = await feedCharts(soon(), new Date("2026-10-01T00:00:00Z"), fetchImpl);

    expect(done).toBe(true);
    expect(report.added).toBe(1);
    expect(report.alreadyKnown).toBe(1);

    const newSongs = songs()
      .all()
      .filter((s: any) => s.origin === "chart");
    expect(newSongs).toHaveLength(1);
    expect(newSongs[0]).toMatchObject({
      title: "New Hit",
      artist: "New Artist",
      cuts: [],
      origin: "chart",
      chartCountries: ["us"],
    });

    expect(cronState().get("chart:us").fetchedAt).toEqual(new Date("2026-10-01T00:00:00Z"));
  });

  it("keeps a multi-act credit whole but still dedupes it against a pack song", async () => {
    songs().seed({
      _id: "pack-song",
      title: "Die With A Smile",
      artist: "Lady Gaga",
      cuts: ["v1"],
      addCount: 0,
      addsByCountry: {},
      demand: 0,
    });

    const fetchImpl = stubFetch({
      us: chartResponse([{ name: "Die With A Smile", artistName: "Lady Gaga & Bruno Mars" }]),
      gb: chartResponse([]),
      ph: chartResponse([]),
      de: chartResponse([]),
    });

    const { report } = await feedCharts(soon(), new Date("2026-10-01T00:00:00Z"), fetchImpl);

    expect(report.added).toBe(0);
    expect(report.alreadyKnown).toBe(1);
  });

  it("merges a second country's hit into the song its first country just inserted", async () => {
    const fetchImpl = stubFetch({
      us: chartResponse([{ name: "New Hit", artistName: "New Artist" }]),
      gb: chartResponse([{ name: "New Hit", artistName: "New Artist" }]),
      ph: chartResponse([]),
      de: chartResponse([]),
    });

    const { report } = await feedCharts(soon(), new Date("2026-10-01T00:00:00Z"), fetchImpl);

    expect(report.added).toBe(1);
    const inserted = songs().all().find((s: any) => s.origin === "chart");
    expect(inserted.chartCountries).toEqual(["us", "gb"]);
  });

  it("fetches nothing for a country within 20 hours, and refetches after a day", async () => {
    const first = new Date("2026-10-01T00:00:00Z");
    for (const cc of CHART_COUNTRIES) {
      cronState().seed({ _id: `chart:${cc}`, fetchedAt: first, cursorAt: first, updatedAt: first });
    }

    const nineteenHoursLater = new Date(first.getTime() + 19 * 60 * 60 * 1000);
    const fetchImpl = stubFetch({});
    const early = await feedCharts(soon(), nineteenHoursLater, fetchImpl);
    expect(early.report.fetched).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();

    const dayLater = new Date(first.getTime() + 24 * 60 * 60 * 1000);
    const next = await feedCharts(soon(), dayLater, stubFetch({}));
    expect(next.report.fetched).toBe(CHART_COUNTRIES_PER_RUN);
  });

  it("reports a failed country without stopping the others, and skips it on a retry within a day", async () => {
    const first = new Date("2026-10-01T00:00:00Z");
    const fetchImpl = stubFetch({
      us: new Error("network down"),
      gb: chartResponse([]),
      ph: chartResponse([]),
      de: chartResponse([]),
    });

    const { report } = await feedCharts(soon(), first, fetchImpl);

    expect(report.errors).toEqual([{ country: "us", message: "network down" }]);
    expect(report.fetched).toBe(CHART_COUNTRIES_PER_RUN - 1);
    expect(cronState().get("chart:us").failedAt).toEqual(first);
    expect(cronState().get("chart:gb").fetchedAt).toBeInstanceOf(Date);

    const twelveHoursLater = new Date(first.getTime() + 12 * 60 * 60 * 1000);
    const retryFetch = stubFetch({
      es: chartResponse([]),
      mx: chartResponse([]),
      tw: chartResponse([]),
      my: chartResponse([]),
    });
    const retry = await feedCharts(soon(), twelveHoursLater, retryFetch);
    expect(retry.report.countries).not.toContain("us");

    const twoDaysLater = new Date(first.getTime() + 2 * 24 * 60 * 60 * 1000);
    const laterFetch = stubFetch({
      us: chartResponse([]),
      es: chartResponse([]),
      mx: chartResponse([]),
      tw: chartResponse([]),
    });
    const later = await feedCharts(soon(), twoDaysLater, laterFetch);
    expect(later.report.countries).toContain("us");
  });

  it("caps new song inserts at CHART_NEW_SONGS_PER_RUN and leaves the cut-off country due", async () => {
    const results = Array.from({ length: CHART_NEW_SONGS_PER_RUN + 10 }, (_, i) => ({
      name: `Song ${i}`,
      artistName: `Artist ${i}`,
    }));
    const fetchImpl = stubFetch({
      us: chartResponse(results),
      gb: chartResponse([]),
      ph: chartResponse([]),
      de: chartResponse([]),
    });

    const { report } = await feedCharts(soon(), new Date("2026-10-01T00:00:00Z"), fetchImpl);

    expect(report.added).toBe(CHART_NEW_SONGS_PER_RUN);
    expect(cronState().get("chart:us")).toBeNull();
  });

  it("leaves every country due when the song write fails", async () => {
    const fetchImpl = stubFetch({
      us: chartResponse([{ name: "New Hit", artistName: "New Artist" }]),
      gb: chartResponse([]),
      ph: chartResponse([]),
      de: chartResponse([]),
    });
    vi.spyOn(songs(), "bulkWrite").mockRejectedValueOnce(new Error("boom"));

    await feedCharts(soon(), new Date("2026-10-01T00:00:00Z"), fetchImpl);

    expect(cronState().get("chart:us")).toBeNull();
    expect(cronState().get("chart:gb")).toBeNull();
  });
});

describe("chart snapshots", () => {
  const day1 = new Date("2026-10-01T00:00:00Z");
  const day2 = new Date("2026-10-02T00:00:00Z");

  it("ranks pack and chart songs alike, keeping each song's best rank", async () => {
    songs().seed({
      _id: "pack-song",
      title: "Shape of You",
      artist: "Ed Sheeran",
      cuts: ["v1"],
      addCount: 0,
      addsByCountry: {},
      demand: 0,
    });
    await feedCharts(
      soon(),
      day1,
      stubFetch({
        us: chartResponse([
          { name: "New Hit", artistName: "New Artist" },
          { name: "Shape of You", artistName: "Ed Sheeran" },
          { name: "New Hit (feat. Someone)", artistName: "New Artist" },
        ]),
      })
    );

    const snap = snapshots().get("us");
    expect(snap.ranks).toEqual([
      { key: "new artist new hit karaoke", rank: 1 },
      { key: "pack-song", rank: 2 },
    ]);
    expect(snap.fetchedAt).toEqual(day1);
    expect(snap.prevRanks).toBeUndefined();
  });

  it("writes no snapshot for a country whose song write failed", async () => {
    vi.spyOn(songs(), "bulkWrite").mockRejectedValueOnce(new Error("boom"));
    await feedCharts(
      soon(),
      day1,
      stubFetch({ us: chartResponse([{ name: "New Hit", artistName: "New Artist" }]) })
    );
    expect(snapshots().get("us")).toBeNull();
  });

  it("rolls the previous day's chart into prevRanks and dates a new entry", () => {
    const first = nextSnapshot("us", [{ key: "a", rank: 1 }, { key: "b", rank: 2 }], undefined, day1);
    expect(first.ranks).toEqual([{ key: "a", rank: 1 }, { key: "b", rank: 2 }]);

    const second = nextSnapshot("us", [{ key: "b", rank: 1 }, { key: "c", rank: 2 }], first, day2);
    expect(second.prevRanks).toEqual(first.ranks);
    expect(second.prevFetchedAt).toEqual(day1);
    expect(second.ranks).toEqual([
      { key: "b", rank: 1 },
      { key: "c", rank: 2, since: day2 },
    ]);
  });

  it("keeps a song's since date while it stays on the chart", () => {
    const withNew = nextSnapshot(
      "us",
      [{ key: "c", rank: 2 }],
      { _id: "us", ranks: [{ key: "x", rank: 1 }], fetchedAt: day1 },
      day2
    );
    const day3 = new Date("2026-10-03T00:00:00Z");
    const later = nextSnapshot("us", [{ key: "c", rank: 1 }], withNew, day3);
    expect(later.ranks).toEqual([{ key: "c", rank: 1, since: day2 }]);
  });

  it("keeps the older prevRanks on a same-window refetch rather than comparing a chart to itself", () => {
    const first = nextSnapshot("us", [{ key: "a", rank: 1 }], undefined, day1);
    const second = nextSnapshot("us", [{ key: "a", rank: 2 }], first, day2);
    const refetch = nextSnapshot(
      "us",
      [{ key: "a", rank: 3 }],
      second,
      new Date(day2.getTime() + 60 * 60 * 1000)
    );
    expect(refetch.prevRanks).toEqual(first.ranks);
    expect(refetch.prevFetchedAt).toEqual(day1);
  });
});
