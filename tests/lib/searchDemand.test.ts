import { describe, it, expect, vi, beforeEach } from "vitest";
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
  MAX_TRACKED_ROOMS,
  countsAsDemand,
  demandKey,
  recordSearchDemand,
} from "../../lib/searchDemand";
const demand = () => collection("search_demand");

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
