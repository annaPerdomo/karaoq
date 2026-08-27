import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeCollection, type FakeCollection } from "../helpers/fakeCollection";

const collections = new Map<string, FakeCollection>();

function collection(name: string): FakeCollection {
  if (!collections.has(name)) {
    // Wired to reach the others: the wanted list joins karaoke_songs.
    collections.set(name, fakeCollection((from) => collection(from).all()));
  }
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
  MAX_TRACKED_ROOMS,
  countsAsDemand,
  demandKey,
  recordSearchDemand,
} from "../../lib/searchDemand";
import {
  searchDemandScores,
  wantedRowFrom,
  wantedSearches,
} from "../../lib/searchDemandRead";

const demand = () => collection("search_demand");
const songs = () => collection("karaoke_songs");

beforeEach(() => {
  // The instances go, not just their rows: tests below stub a method to force a
  // failure, and one left in place silently empties every test after it.
  collections.clear();
});

const search = (query: string, over: Record<string, unknown> = {}) =>
  recordSearchDemand({
    query,
    roomId: "ROOM1",
    country: "PH",
    outcome: "spent",
    ...over,
  } as Parameters<typeof recordSearchDemand>[0]);

describe("demandKey", () => {
  it("keys both search modes on the one song", () => {
    expect(demandKey("dancing queen")).toBe(demandKey("dancing queen karaoke"));
  });

  it("keys on the same string karaoke_songs files a song under", () => {
    // karaoke_songs._id is searchCacheKey(buildSearchQuery(`${artist} ${title}`,
    // true)) — see lib/corpusResolve. A row keyed any other way joins nothing.
    expect(demandKey("ABBA Dancing Queen")).toBe("abba dancing queen karaoke");
  });

  it("folds accents and script the way the corpus does", () => {
    expect(demandKey("Café Tacvba Erés")).toBe(demandKey("Cafe Tacvba Eres"));
  });
});

describe("countsAsDemand", () => {
  it("refuses an operator query", () => {
    // "-karaoke" excludes the very thing the folded key would credit.
    expect(countsAsDemand("abba dancing queen -karaoke")).toBe(false);
    expect(countsAsDemand('"dancing queen"')).toBe(false);
  });

  it("refuses a query that names no song", () => {
    // Both fold to the bare mode word, which identifies nothing.
    expect(countsAsDemand("!!! ???")).toBe(false);
    expect(countsAsDemand("karaoke")).toBe(false);
  });

  it("counts an ordinary song name", () => {
    expect(countsAsDemand("abba dancing queen")).toBe(true);
  });
});

describe("recordSearchDemand", () => {
  it("opens a row on the first search", async () => {
    await search("The Agadiers Mag Dungan Ta");

    const [row] = demand().all();
    expect(row).toMatchObject({
      _id: demandKey("The Agadiers Mag Dungan Ta"),
      label: "The Agadiers Mag Dungan Ta",
      count: 1,
      byCountry: { PH: 1 },
      rooms: ["ROOM1"],
      outcomes: { spent: 1 },
    });
    expect(row.firstSeenAt).toBeInstanceOf(Date);
    expect(row.lastSeenAt).toBeInstanceOf(Date);
  });

  it("adds up searches from different countries onto one song", async () => {
    await search("Dancing Queen", { country: "PH", roomId: "R1" });
    await search("dancing queen karaoke", { country: "DE", roomId: "R2" });
    await search("Dancing Queen", { country: "DE", roomId: "R3" });

    expect(demand().all()).toHaveLength(1);
    expect(demand().all()[0]).toMatchObject({
      count: 3,
      byCountry: { PH: 1, DE: 2 },
      rooms: ["R1", "R2", "R3"],
    });
  });

  it("counts each outcome apart, so wanting can be told from getting", async () => {
    await search("Bohemian Rhapsody", { outcome: "served" });
    await search("Bohemian Rhapsody", { outcome: "served" });
    await search("Bohemian Rhapsody", { outcome: "spent" });
    await search("Bohemian Rhapsody", { outcome: "error" });

    expect(demand().all()[0].outcomes).toEqual({ served: 2, spent: 1, error: 1 });
  });

  it("stops collecting room ids rather than growing the document", async () => {
    for (let i = 0; i < MAX_TRACKED_ROOMS + 8; i++) {
      await search("Killer Queen", { roomId: `R${i}` });
    }

    const row = demand().all()[0];
    expect(row.rooms).toHaveLength(MAX_TRACKED_ROOMS);
    // The count keeps rising: it's the room list that's a bound, not the demand.
    expect(row.count).toBe(MAX_TRACKED_ROOMS + 8);
  });

  it("never counts a room twice toward consensus", async () => {
    await search("Killer Queen", { roomId: "R1" });
    await search("Killer Queen", { roomId: "R1" });

    expect(demand().all()[0].rooms).toEqual(["R1"]);
  });

  it("records a country-less search without breaking the map", async () => {
    await search("Killer Queen", { country: undefined });

    expect(demand().all()[0].byCountry).toEqual({});
  });

  it("records a search made outside any room", async () => {
    await search("Killer Queen", { roomId: "" });

    const row = demand().all()[0];
    expect(row.count).toBe(1);
    expect(row.rooms).toBeUndefined();
  });

  it("writes nothing for an operator query", async () => {
    await search("abba dancing queen -karaoke");

    expect(demand().all()).toHaveLength(0);
  });

  it("keeps the signature stable once written", async () => {
    await search("Dancing Queen ABBA");
    const first = demand().all()[0].signature;
    await search("Dancing Queen ABBA");

    expect(demand().all()[0].signature).toBe(first);
  });

  it("gives two orderings of one name the same signature", async () => {
    await search("Dancing Queen ABBA");
    await search("ABBA Dancing Queen");

    const signatures = demand().all().map((r) => r.signature);
    expect(signatures).toHaveLength(2);
    expect(signatures[0]).toBe(signatures[1]);
  });

  it("swallows a write that fails rather than erroring into the search", async () => {
    const broken = demand();
    broken.bulkWrite = async () => {
      throw new Error("no");
    };

    await expect(search("Killer Queen")).resolves.toBeUndefined();
  });
});

describe("wantedRowFrom", () => {
  it("puts the widest country first", () => {
    const row = wantedRowFrom({
      _id: "k",
      label: "A song",
      countryList: [
        { k: "DE", v: 2 },
        { k: "PH", v: 9 },
        { k: "AU", v: 2 },
      ],
    });

    expect(row.countries).toEqual([
      { code: "PH", count: 9 },
      { code: "AU", count: 2 },
      { code: "DE", count: 2 },
    ]);
  });

  it("still identifies a row written before the label existed", () => {
    expect(wantedRowFrom({ _id: "abba dancing queen karaoke" }).label).toBe(
      "abba dancing queen karaoke"
    );
  });

  it("reads a row with no counters yet as zeroes, not as missing", () => {
    const row = wantedRowFrom({ _id: "k" });
    expect(row).toMatchObject({
      count: 0,
      rooms: 0,
      spent: 0,
      unmet: 0,
      catalogued: false,
      hasCuts: false,
      countries: [],
    });
  });
});

describe("wantedSearches", () => {
  /** A song the corpus holds, with or without cuts to serve from. */
  function held(query: string, cuts: string[]) {
    songs().seed({
      _id: demandKey(query),
      cuts: cuts.map((videoId) => ({ videoId })),
    });
  }

  async function asked(
    query: string,
    countries: string[],
    over: Record<string, unknown> = {}
  ) {
    for (const country of countries) {
      await search(query, { country, roomId: `R-${country}`, ...over });
    }
  }

  const rowFor = (report: { rows: { key: string }[] }, query: string) =>
    report.rows.find((row) => row.key === demandKey(query));

  it("says of each query whether the corpus can already answer it", async () => {
    held("Dancing Queen", ["v1"]);
    held("Killer Queen", []);
    await asked("Dancing Queen", ["PH"]);
    await asked("Killer Queen", ["PH"]);
    await asked("Mag Dungan Ta", ["PH"]);

    const report = await wantedSearches({ gapsOnly: false });

    expect(rowFor(report, "Dancing Queen")).toMatchObject({
      catalogued: true,
      hasCuts: true,
    });
    // Approved into the catalogue, still waiting on the resolver to buy a cut.
    expect(rowFor(report, "Killer Queen")).toMatchObject({
      catalogued: true,
      hasCuts: false,
    });
    expect(rowFor(report, "Mag Dungan Ta")).toMatchObject({
      catalogued: false,
      hasCuts: false,
    });
  });

  it("leaves out what the corpus serves when asked for gaps only", async () => {
    held("Dancing Queen", ["v1"]);
    await asked("Dancing Queen", ["PH"]);
    await asked("Mag Dungan Ta", ["PH"]);

    const report = await wantedSearches({ gapsOnly: true });

    expect(report.rows.map((row) => row.key)).toEqual([
      demandKey("Mag Dungan Ta"),
    ]);
    expect(report.matched).toBe(1);
  });

  it("ranks breadth over volume, and volume when asked", async () => {
    // One room's fortieth ask against three countries asking once each.
    for (let i = 0; i < 40; i++) {
      await search("Killer Queen", { country: "PH", roomId: "R1" });
    }
    await asked("Mag Dungan Ta", ["PH", "DE", "AU"]);

    const breadth = await wantedSearches({ gapsOnly: false });
    expect(breadth.rows.map((row) => row.key)).toEqual([
      demandKey("Mag Dungan Ta"),
      demandKey("Killer Queen"),
    ]);

    const volume = await wantedSearches({ gapsOnly: false, rank: "volume" });
    expect(volume.rows.map((row) => row.key)).toEqual([
      demandKey("Killer Queen"),
      demandKey("Mag Dungan Ta"),
    ]);
  });

  it("counts every country that asked, widest first", async () => {
    await asked("Mag Dungan Ta", ["DE", "PH", "PH", "AU"]);

    const report = await wantedSearches({ gapsOnly: false });

    expect(rowFor(report, "Mag Dungan Ta")).toMatchObject({
      count: 4,
      countries: [
        { code: "PH", count: 2 },
        { code: "AU", count: 1 },
        { code: "DE", count: 1 },
      ],
    });
  });

  it("totals the whole search load, not the rows the filter kept", async () => {
    held("Dancing Queen", ["v1"]);
    await asked("Dancing Queen", ["PH"], { outcome: "served" });
    await asked("Mag Dungan Ta", ["PH"], { outcome: "spent" });
    await asked("Mag Dungan Ta", ["DE"], { outcome: "error" });

    const report = await wantedSearches({ gapsOnly: true });

    // One row shown, three searches counted: the gap is a share of all of them.
    expect(report.rows).toHaveLength(1);
    expect(report.totals).toEqual({
      queries: 2,
      searches: 3,
      served: 1,
      spent: 1,
      stale: 0,
      corpus: 0,
      error: 1,
    });
    expect(rowFor(report, "Mag Dungan Ta")).toMatchObject({ spent: 1, unmet: 1 });
  });

  it("says how many rows the cap left off", async () => {
    await asked("Mag Dungan Ta", ["PH"]);
    await asked("Killer Queen", ["PH"]);
    await asked("Dancing Queen", ["PH"]);

    const report = await wantedSearches({ gapsOnly: false, limit: 2 });

    expect(report.rows).toHaveLength(2);
    expect(report.matched).toBe(3);
    expect(report.limit).toBe(2);
  });

  it("reads an empty ledger as zeroes rather than throwing", async () => {
    const report = await wantedSearches();

    expect(report.rows).toEqual([]);
    expect(report.matched).toBe(0);
    expect(report.totals.searches).toBe(0);
  });
});

describe("searchDemandScores", () => {
  it("scores a song by the countries that typed it, and by how often", async () => {
    await search("Mag Dungan Ta", { country: "PH", roomId: "R1" });
    await search("Mag Dungan Ta", { country: "DE", roomId: "R2" });
    await search("Killer Queen", { country: "PH", roomId: "R1" });

    const scores = await searchDemandScores();

    expect(scores.get(demandKey("Mag Dungan Ta"))).toEqual({
      searches: 2,
      countries: 2,
    });
    expect(scores.get(demandKey("Killer Queen"))).toEqual({
      searches: 1,
      countries: 1,
    });
  });

  it("hands the resolver an empty map when the ledger cannot be read", async () => {
    const broken = demand();
    broken.aggregate = () => {
      throw new Error("no");
    };

    await expect(searchDemandScores()).resolves.toEqual(new Map());
  });
});
