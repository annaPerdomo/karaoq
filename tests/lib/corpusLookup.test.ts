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
  buildSongIndex,
  findSongForQuery,
  queryTokens,
  resetSongIndexCache,
} from "../../lib/corpusLookup";

const songs = () => collection("karaoke_songs");

function song(over: Record<string, unknown>) {
  return {
    _id: "unused",
    title: "",
    artist: "",
    cuts: ["v1"],
    addCount: 0,
    demand: 0,
    ...over,
  };
}

beforeEach(() => {
  collections.clear();
  resetSongIndexCache();
});

describe("queryTokens", () => {
  it("drops filler words and dedupes", () => {
    expect(queryTokens("Mr Brightside karaoke lyrics version")).toEqual([
      "mr",
      "brightside",
    ]);
  });
});

describe("buildSongIndex", () => {
  const brightside = song({
    _id: "the killers mr brightside karaoke",
    artist: "The Killers",
    title: "Mr Brightside",
  });

  it("finds a song from title alone, either word order, and accents/punctuation", () => {
    const index = buildSongIndex([brightside]);
    for (const query of [
      "mr brightside karaoke",
      "Mr. Brightside",
      "brightside mr the killers",
      "The Killers - Mr Brightside",
    ]) {
      expect(index.lookup(query)).toBe(brightside._id);
    }
  });

  it("ignores accents", () => {
    const halo = song({ _id: "beyonce halo karaoke", artist: "Beyonce", title: "Halo" });
    const index = buildSongIndex([halo]);
    expect(index.lookup("Beyoncé Halo")).toBe(halo._id);
  });

  it("matches a short but distinctive title alone, and excludes a two-letter one", () => {
    const zombie = song({ _id: "cranberries zombie karaoke", artist: "The Cranberries", title: "Zombie" });
    const go = song({ _id: "vampire weekend go karaoke", artist: "Vampire Weekend", title: "Go" });
    const index = buildSongIndex([zombie, go]);
    expect(index.lookup("zombie")).toBe(zombie._id);
    expect(index.lookup("go")).toBeNull();
  });

  it("picks the higher addCount+demand song for a shared title, but artist+title still finds the other", () => {
    const adele = song({
      _id: "adele hello karaoke",
      artist: "Adele",
      title: "Hello",
      addCount: 10,
      demand: 5,
    });
    const lionel = song({
      _id: "lionel richie hello karaoke",
      artist: "Lionel Richie",
      title: "Hello",
      addCount: 1,
      demand: 0,
    });
    const index = buildSongIndex([lionel, adele]);
    expect(index.lookup("hello")).toBe(adele._id);
    expect(index.lookup("adele hello")).toBe(adele._id);
    expect(index.lookup("lionel richie hello")).toBe(lionel._id);
  });

  it("never matches a song with no cuts", () => {
    const uncut = song({
      _id: "cutless karaoke",
      artist: "Nobody",
      title: "Nothing Yet",
      cuts: [],
    });
    const index = buildSongIndex([uncut]);
    expect(index.lookup("nothing yet")).toBeNull();
    expect(index.lookup("nobody nothing yet")).toBeNull();
  });

  it("doesn't match on the artist alone", () => {
    const dancingQueen = song({
      _id: "abba dancing queen karaoke",
      artist: "Abba",
      title: "Dancing Queen",
    });
    const index = buildSongIndex([dancingQueen]);
    expect(index.lookup("abba karaoke")).toBeNull();

    const abba = song({ _id: "abba abba karaoke", artist: "Abba", title: "Abba" });
    const withTitledAbba = buildSongIndex([dancingQueen, abba]);
    expect(withTitledAbba.lookup("abba karaoke")).toBe(abba._id);
  });

  it("counts tokens, not characters, for the title-only threshold", () => {
    // "Cover" is filler, so "Cover Me" leaves one token ("me") — too short alone.
    const coverMe = song({ _id: "coverless cover me karaoke", artist: "Coverless", title: "Cover Me" });
    // Two words that dedupe to one distinct token are still just one token.
    const goGo = song({ _id: "wham go go karaoke", artist: "Wham", title: "Go Go" });
    const index = buildSongIndex([coverMe, goGo]);
    expect(index.lookup("me")).toBeNull();
    expect(index.lookup("go")).toBeNull();
    expect(index.lookup("coverless cover me")).toBe(coverMe._id);
  });

  it("registers nothing for a title that is entirely filler", () => {
    // "Karaoke" is the one filler word the title tokenizes to — nothing left
    // to tell this song apart from any other search for its artist.
    const drakeKaraoke = song({ _id: "drake karaoke karaoke", artist: "Drake", title: "Karaoke" });
    const index = buildSongIndex([drakeKaraoke]);
    expect(index.lookup("drake karaoke")).toBeNull();
    expect(index.lookup("drake")).toBeNull();
  });
});

describe("findSongForQuery", () => {
  it("returns the exact key when the song is stored under the full query", async () => {
    songs().seed({
      _id: "the killers mr brightside karaoke",
      artist: "The Killers",
      title: "Mr Brightside",
      cuts: ["v1"],
    });
    expect(await findSongForQuery("The Killers Mr Brightside karaoke")).toBe(
      "the killers mr brightside karaoke"
    );
  });

  it("falls back to the loose index when the exact key misses", async () => {
    songs().seed({
      _id: "the killers mr brightside karaoke",
      artist: "The Killers",
      title: "Mr Brightside",
      cuts: ["v1"],
    });
    expect(await findSongForQuery("mr brightside")).toBe(
      "the killers mr brightside karaoke"
    );
  });

  it("never matches a retired song, exact or loose", async () => {
    songs().seed({
      _id: "the killers mr brightside karaoke",
      artist: "The Killers",
      title: "Mr Brightside",
      cuts: ["v1"],
      retired: true,
    });
    expect(await findSongForQuery("The Killers Mr Brightside karaoke")).toBeNull();
    expect(await findSongForQuery("mr brightside")).toBeNull();
  });

  it("returns null rather than throwing when the lookup fails", async () => {
    vi.spyOn(songs(), "findOne").mockRejectedValueOnce(new Error("down"));
    expect(await findSongForQuery("mr brightside")).toBeNull();
  });

  it("never banks an operator query onto a song it may have excluded", async () => {
    songs().seed({
      _id: "the killers mr brightside karaoke",
      artist: "The Killers",
      title: "Mr Brightside",
      cuts: ["v1"],
    });
    expect(await findSongForQuery("mr brightside -karaoke")).toBeNull();
  });

});
