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

import { blockVideos, filterBlockedIds } from "../../lib/videoBlocklist";

const blocked = () => collection("blocked_videos");

const LONG_AGO = new Date("2026-06-01T00:00:00Z");

beforeEach(() => {
  collections.forEach((c) => c.clear());
});

describe("blockVideos", () => {
  it("tombstones each id with the reason it was thrown out", async () => {
    const written = await blockVideos(["v1", "v2"], "unembeddable");

    expect(written).toBe(2);
    expect(blocked().get("v1")).toMatchObject({ reason: "unembeddable" });
    expect(blocked().get("v1").blockedAt).toBeInstanceOf(Date);
    expect(blocked().get("v2")).toMatchObject({ reason: "unembeddable" });
  });

  it("restarts the re-test clock rather than filing a second tombstone", async () => {
    blocked().seed({ _id: "v1", reason: "unembeddable", blockedAt: LONG_AGO });

    const written = await blockVideos(["v1"], "unembeddable");

    expect(written).toBe(0);
    expect(blocked().all()).toHaveLength(1);
    expect(blocked().get("v1").blockedAt.getTime()).toBeGreaterThan(
      LONG_AGO.getTime()
    );
  });

  it("writes nothing for an empty batch", async () => {
    expect(await blockVideos([], "unembeddable")).toBe(0);
    expect(blocked().all()).toEqual([]);
  });
});

describe("filterBlockedIds", () => {
  it("names only the ids currently blocked", async () => {
    await blockVideos(["blocked1", "blocked2"], "unembeddable");

    const found = await filterBlockedIds(["blocked1", "fine1", "blocked2"]);

    expect(Array.from(found).sort()).toEqual(["blocked1", "blocked2"]);
  });

  it("is empty when nothing in the batch is blocked", async () => {
    await blockVideos(["blocked1"], "unembeddable");

    expect((await filterBlockedIds(["fine1", "fine2"])).size).toBe(0);
  });

  it("is empty for an empty batch", async () => {
    expect((await filterBlockedIds([])).size).toBe(0);
  });
});
