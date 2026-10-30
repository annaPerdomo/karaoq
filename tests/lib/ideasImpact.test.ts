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
      db: () => ({ collection: (name: string) => collection(name), command: vi.fn(async () => ({})) }),
    };
  },
}));

process.env.MONGODB_URI = "mongodb://test";
process.env.MONGODB_DB = "test-db";

import { IMPACT_WEEKS, computeIdeasImpact, weekStart } from "../../lib/ideasImpact";
import { ideaFields } from "../../lib/ideaSurface";

const events = () => collection("analytics_events");
const NOW = new Date("2026-10-30T12:00:00Z"); // a Friday
const DAY = 24 * 60 * 60 * 1000;
let n = 0;
const ev = (doc: Record<string, unknown>, daysAgo: number) =>
  events().seed({ _id: `e${n++}`, timestamp: new Date(NOW.getTime() - daysAgo * DAY), ...doc });

beforeEach(() => collections.forEach((c) => c.clear()));

describe("weekStart", () => {
  it("files a day under the Monday of its UTC week", () => {
    expect(weekStart(new Date("2026-10-30T23:00:00Z"))).toBe("2026-10-26");
    expect(weekStart(new Date("2026-10-26T00:00:00Z"))).toBe("2026-10-26");
    expect(weekStart(new Date("2026-10-25T23:59:59Z"))).toBe("2026-10-19");
  });
});

describe("computeIdeasImpact", () => {
  it("counts the weekly ideas share and taps vs adds per surface", async () => {
    ev({ type: "song_added", suggestionKey: "k1", ideaSurface: "hot", ideaAway: false }, 1);
    ev({ type: "song_added", suggestionKey: "k2", ideaSurface: "voice", ideaAway: true }, 2);
    ev({ type: "song_added", suggestionKey: "k3" }, 3);
    ev({ type: "song_added" }, 1);
    ev({ type: "song_added" }, 10);
    ev({ type: "suggestion_used", suggestionSource: "shelf", ideaSurface: "hot", ideaAway: false }, 1);
    ev({ type: "suggestion_used", suggestionSource: "shelf", ideaSurface: "hot", ideaAway: false }, 1);
    ev({ type: "suggestion_used", suggestionSource: "genre_chip", ideaSurface: "voice", ideaAway: true }, 1);
    ev({ type: "suggestion_used", suggestionSource: "song_pick", ideaSurface: "voice", ideaAway: true }, 2);

    const impact = await computeIdeasImpact(NOW);
    expect(impact.weeks).toHaveLength(IMPACT_WEEKS);
    expect(impact.weeks[IMPACT_WEEKS - 1]).toEqual({ weekStart: "2026-10-26", adds: 4, ideas: 3 });
    expect(impact.weeks[IMPACT_WEEKS - 2]).toEqual({ weekStart: "2026-10-19", adds: 1, ideas: 0 });
    expect(impact.surfaces).toEqual([
      { surface: "hot", away: false, taps: 2, adds: 1 },
      { surface: "voice", away: true, taps: 1, adds: 1 },
      { surface: "unknown", away: null, taps: 0, adds: 1 },
    ]);
  });
});

describe("ideaFields", () => {
  it("keeps only a known surface, and away only beside it", () => {
    expect(ideaFields({ ideaSurface: "rooms", ideaAway: true })).toEqual({ ideaSurface: "rooms", ideaAway: true });
    expect(ideaFields({ ideaSurface: "rooms", ideaAway: "yes" })).toEqual({ ideaSurface: "rooms" });
    expect(ideaFields({ ideaSurface: "jukebox", ideaAway: true })).toEqual({});
  });
});
