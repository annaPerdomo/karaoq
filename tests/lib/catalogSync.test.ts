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

import { syncCatalog } from "../../lib/catalogSync";
import { suggestionCatalog } from "../../lib/suggestionCatalog";

const songs = () => collection("karaoke_songs");

beforeEach(() => collections.forEach((c) => c.clear()));

describe("syncCatalog", () => {
  it("seeds every catalog song the corpus lacks, cutless, and leaves held ones alone", async () => {
    const keys = Array.from(suggestionCatalog().keys());
    songs().seed({ _id: keys[0], title: "Held", artist: "A", cuts: ["v1"], addCount: 3, addsByCountry: {}, demand: 9 });

    const { report } = await syncCatalog();
    expect(report).toEqual({ catalog: keys.length, seeded: keys.length - 1 });
    expect(songs().get(keys[0])).toMatchObject({ title: "Held", cuts: ["v1"], demand: 9 });
    expect(songs().get(keys[1])).toMatchObject({ cuts: [], addCount: 0, demand: 0 });

    const again = await syncCatalog();
    expect(again.report.seeded).toBe(0);
  });
});
