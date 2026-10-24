import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

import { REMATCH_ID, rematchMissedSongs } from "../../lib/corpusRematch";

const songs = () => collection("karaoke_songs");
const state = () => collection("cron_state");
const later = new Date("2026-11-10T00:00:00Z");

function seed(_id: string, extra: Record<string, unknown>) {
  songs().seed({ _id, title: _id, artist: "A", addCount: 0, addsByCountry: {}, demand: 0, ...extra });
}

beforeEach(() => {
  collections.forEach((c) => c.clear());
  process.env.KARAOQ_ENV = "production";
});

afterEach(() => {
  delete process.env.KARAOQ_ENV;
});

describe("rematchMissedSongs", () => {
  it("gives every cutless song with a miss a fresh try, once", async () => {
    seed("backed-off", { cuts: [], resolveMisses: 1, nextResolveAt: later, origin: "chart" });
    seed("retired", { cuts: [], resolveMisses: 3, retired: true, origin: "demand" });
    seed("filled", { cuts: ["v1"], resolveMisses: 1, nextResolveAt: later });
    seed("untried", { cuts: [] });

    const first = await rematchMissedSongs();
    expect(first.report.reset).toBe(2);
    expect(songs().get("backed-off")).not.toHaveProperty("nextResolveAt");
    expect(songs().get("backed-off")).not.toHaveProperty("resolveMisses");
    expect(songs().get("retired")).not.toHaveProperty("retired");
    expect(songs().get("filled").nextResolveAt).toEqual(later);
    expect(state().get(REMATCH_ID).done).toBe(true);

    seed("missed-again", { cuts: [], resolveMisses: 1, nextResolveAt: later });
    const second = await rematchMissedSongs();
    expect(second.report).toEqual({ reset: 0, skipped: true });
    expect(songs().get("missed-again").nextResolveAt).toEqual(later);
  });

  it("never runs outside production — dev shares the database", async () => {
    delete process.env.KARAOQ_ENV;
    seed("backed-off", { cuts: [], resolveMisses: 1, nextResolveAt: later });

    const { report } = await rematchMissedSongs();
    expect(report.skipped).toBe("not production");
    expect(songs().get("backed-off").nextResolveAt).toEqual(later);
    expect(state().get(REMATCH_ID)).toBeNull();
  });
});
