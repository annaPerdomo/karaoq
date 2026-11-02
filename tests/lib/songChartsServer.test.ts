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

import { countriesWithCharts, readTopSongs } from "../../lib/songChartsServer";
import { CHART_MIN_SONGS } from "../../lib/songCharts";

const songs = () => collection("karaoke_songs");
const videos = () => collection("karaoke_videos");

function seedServedVideo(id: string, served = true) {
  videos().seed({ _id: id, thumbnailUrl: served ? "https://img/" + id : "" });
}

beforeEach(() => {
  collections.clear();
});

describe("readTopSongs", () => {
  it("only returns packed or chart-origin songs with a servable cut", async () => {
    seedServedVideo("v-core");
    songs().seed({
      _id: "core-song",
      title: "Core Song",
      artist: "Core Artist",
      packIds: ["core"],
      cuts: ["v-core"],
      addCount: 10,
      addsByCountry: {},
    });

    seedServedVideo("v-chart");
    songs().seed({
      _id: "chart-song",
      title: "Chart Song",
      artist: "Chart Artist",
      origin: "chart",
      cuts: ["v-chart"],
      addCount: 8,
      addsByCountry: {},
    });

    // Demand-promoted, no packIds: unverified names, must be excluded.
    seedServedVideo("v-demand");
    songs().seed({
      _id: "demand-song",
      title: "Demand Song",
      artist: "Demand Artist",
      origin: "demand",
      cuts: ["v-demand"],
      addCount: 50,
      addsByCountry: {},
    });

    // Retired — excluded even with cuts and adds.
    seedServedVideo("v-retired");
    songs().seed({
      _id: "retired-song",
      title: "Retired Song",
      artist: "Retired Artist",
      packIds: ["core"],
      cuts: ["v-retired"],
      retired: true,
      addCount: 20,
      addsByCountry: {},
    });

    // No cuts at all — excluded.
    songs().seed({
      _id: "cutless-song",
      title: "Cutless Song",
      artist: "Cutless Artist",
      packIds: ["core"],
      cuts: [],
      addCount: 30,
      addsByCountry: {},
    });

    // Cuts exist but none are servable — excluded.
    seedServedVideo("v-unservable", false);
    songs().seed({
      _id: "unservable-song",
      title: "Unservable Song",
      artist: "Unservable Artist",
      packIds: ["core"],
      cuts: ["v-unservable"],
      addCount: 15,
      addsByCountry: {},
    });

    const result = await readTopSongs({});
    const titles = result.map((s) => s.title).sort();
    expect(titles).toEqual(["Chart Song", "Core Song"]);
    expect(result.every((s) => Object.keys(s).sort().join(",") === "artist,title")).toBe(
      true
    );
  });

  it("sorts by the country's own add count, not the global count", async () => {
    seedServedVideo("v1");
    songs().seed({
      _id: "a",
      title: "A Song",
      artist: "A Artist",
      packIds: ["core"],
      cuts: ["v1"],
      addCount: 100,
      addsByCountry: { US: 1 },
    });

    seedServedVideo("v2");
    songs().seed({
      _id: "b",
      title: "B Song",
      artist: "B Artist",
      packIds: ["core"],
      cuts: ["v2"],
      addCount: 5,
      addsByCountry: { US: 20 },
    });

    const global = await readTopSongs({});
    expect(global.map((s) => s.title)).toEqual(["A Song", "B Song"]);

    const us = await readTopSongs({ country: "us" });
    expect(us.map((s) => s.title)).toEqual(["B Song", "A Song"]);
  });

  it("dedupes case-insensitively on title+artist", async () => {
    seedServedVideo("v1");
    songs().seed({
      _id: "dup-1",
      title: "Same Song",
      artist: "Same Artist",
      packIds: ["core"],
      cuts: ["v1"],
      addCount: 10,
      addsByCountry: {},
    });

    seedServedVideo("v2");
    songs().seed({
      _id: "dup-2",
      title: "same song",
      artist: "same artist",
      packIds: ["cz"],
      cuts: ["v2"],
      addCount: 9,
      addsByCountry: {},
    });

    const result = await readTopSongs({});
    expect(result).toHaveLength(1);
  });
});

describe("countriesWithCharts", () => {
  it("only names a country whose own readTopSongs clears CHART_MIN_SONGS", async () => {
    // US gets enough qualifying songs to clear the threshold.
    for (let i = 0; i < CHART_MIN_SONGS; i++) {
      seedServedVideo(`v-us-${i}`);
      songs().seed({
        _id: `us-song-${i}`,
        title: `US Song ${i}`,
        artist: "Artist",
        packIds: ["core"],
        cuts: [`v-us-${i}`],
        addCount: 1,
        addsByCountry: { US: 1 },
      });
    }

    // GB gets some, but fewer than the threshold.
    for (let i = 0; i < CHART_MIN_SONGS - 1; i++) {
      seedServedVideo(`v-gb-${i}`);
      songs().seed({
        _id: `gb-song-${i}`,
        title: `GB Song ${i}`,
        artist: "Artist",
        packIds: ["core"],
        cuts: [`v-gb-${i}`],
        addCount: 1,
        addsByCountry: { GB: 1 },
      });
    }

    const { countries, allOk } = await countriesWithCharts();
    expect(countries).toContain("us");
    expect(countries).not.toContain("gb");
    expect(allOk).toBe(true);
  });

  it("omits a country whose read fails and reports allOk: false", async () => {
    for (let i = 0; i < CHART_MIN_SONGS; i++) {
      seedServedVideo(`v-us-${i}`);
      songs().seed({
        _id: `us-song-${i}`,
        title: `US Song ${i}`,
        artist: "Artist",
        packIds: ["core"],
        cuts: [`v-us-${i}`],
        addCount: 1,
        addsByCountry: { US: 1 },
      });
    }

    // Throws for GB's query only, simulating one country's read failing in isolation.
    const original = songs().find;
    songs().find = ((filter: any, ...rest: any[]) => {
      if (filter["addsByCountry.GB"]) throw new Error("gb query failed");
      return original(filter, ...rest);
    }) as typeof original;

    const { countries, allOk } = await countriesWithCharts();
    expect(countries).toContain("us");
    expect(countries).not.toContain("gb");
    expect(allOk).toBe(false);
  });
});
