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

const searchMock = vi.fn(async (..._args: unknown[]) => [] as unknown[]);
vi.mock("../../lib/youtubeSearch", () => ({
  searchYoutubeApi: (...args: unknown[]) => searchMock(...args),
}));

process.env.MONGODB_URI = "mongodb://test";
process.env.MONGODB_DB = "test-db";

import { resolveWantedSongs } from "../../lib/corpusResolve";
import { mergeDemand } from "../../lib/suggestionDemand";
import { buildSearchQuery, searchCacheKey } from "../../lib/searchQuery";

const songs = () => collection("karaoke_songs");

function wanted(
  artist: string,
  title: string,
  score: { demand?: number; wantedIn?: number } = {}
) {
  const key = searchCacheKey(buildSearchQuery(`${artist} ${title}`, true));
  songs().seed({
    _id: key,
    title,
    artist,
    cuts: [],
    addCount: 0,
    addsByCountry: {},
    demand: score.demand ?? 0,
    ...(score.wantedIn === undefined ? {} : { wantedIn: score.wantedIn }),
  });
  return key;
}

/** The songs the resolver actually spent a search on, in the order it did. */
function attempted(): string[] {
  return searchMock.mock.calls.map((args) =>
    searchCacheKey(args[0] as string)
  );
}

beforeEach(() => {
  collections.forEach((c) => c.clear());
  searchMock.mockReset();
  searchMock.mockResolvedValue([]);
});

describe("resolveWantedSongs order", () => {
  it("buys the song the most countries asked for first", async () => {
    const narrow = wanted("One Room", "Sung Often", { demand: 500, wantedIn: 1 });
    const wide = wanted("Six Countries", "Sung Once Each", { demand: 6, wantedIn: 6 });

    await resolveWantedSongs(Date.now() + 10_000, 2);

    // Breadth over volume: 500 asks from one place lose to six places asking.
    expect(attempted()).toEqual([wide, narrow]);
  });

  it("falls back to volume between songs of equal reach", async () => {
    const quiet = wanted("Quiet", "Song", { demand: 2, wantedIn: 3 });
    const loud = wanted("Loud", "Song", { demand: 40, wantedIn: 3 });

    await resolveWantedSongs(Date.now() + 10_000, 2);

    expect(attempted()).toEqual([loud, quiet]);
  });

  it("puts a song nobody has ever asked for behind every song somebody has", async () => {
    // Seeded before wantedIn existed, or simply never searched: absent, not zero.
    const unasked = wanted("Never", "Asked", { demand: 0 });
    const asked = wanted("Someone", "Asked", { demand: 1, wantedIn: 1 });

    await resolveWantedSongs(Date.now() + 10_000, 2);

    expect(attempted()).toEqual([asked, unasked]);
  });
});

describe("mergeDemand", () => {
  it("adds a song's searches to its shelf taps", () => {
    const merged = mergeDemand(
      new Map([["k", 5]]),
      new Map([["k", { searches: 7, countries: 3 }]])
    );

    expect(merged.get("k")).toEqual({ demand: 12, wantedIn: 3 });
  });

  it("scores a song that only searches can ever have named", () => {
    // A cutless song renders on no shelf, so its tap count is structurally zero.
    const merged = mergeDemand(
      new Map(),
      new Map([["k", { searches: 4, countries: 4 }]])
    );

    expect(merged.get("k")).toEqual({ demand: 4, wantedIn: 4 });
  });

  it("scores no breadth for a song only taps have named", () => {
    // Rewritten nightly rather than merged: a song the ledger has stopped
    // seeing has to be able to fall.
    const merged = mergeDemand(new Map([["k", 90]]), new Map());

    expect(merged.get("k")).toEqual({ demand: 90, wantedIn: 0 });
  });

  it("keeps the two key spaces from colliding", () => {
    const merged = mergeDemand(
      new Map([["a", 1]]),
      new Map([["b", { searches: 2, countries: 2 }]])
    );

    expect(Array.from(merged.keys()).sort()).toEqual(["a", "b"]);
  });
});
