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

const readSongCutsMock = vi.fn();
vi.mock("../../lib/corpusRead", () => ({
  readSongCuts: (...args: unknown[]) => readSongCutsMock(...args),
}));

process.env.MONGODB_URI = "mongodb://test";
process.env.MONGODB_DB = "test-db";

import { playableCutsFor } from "../../lib/corpusCuts";
import { resetSongIndexCache } from "../../lib/corpusLookup";

beforeEach(() => {
  collections.clear();
  resetSongIndexCache();
  readSongCutsMock.mockReset();
});

describe("playableCutsFor with the real song lookup", () => {
  it.each([
    "ABBA - Dancing Queen (Official Music Video)",
    "Dancing Queen | ABBA",
    "ABBA - Dancing Queen #abba",
  ])("resolves the noisy title %j", async (title) => {
    collection("karaoke_songs").seed({
      _id: "abba dancing queen karaoke",
      artist: "ABBA",
      title: "Dancing Queen",
      cuts: ["v1"],
    });
    const cut = { videoId: "cut10000000", title: "Cut", thumbnailUrl: "t" };
    readSongCutsMock.mockResolvedValue([cut]);

    expect(await playableCutsFor("refused0000", title)).toEqual([cut]);
    expect(readSongCutsMock).toHaveBeenCalledWith("abba dancing queen karaoke");
  });
});
