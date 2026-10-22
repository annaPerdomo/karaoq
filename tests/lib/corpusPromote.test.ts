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
  PROMOTE_MIN_COUNTRIES,
  PROMOTE_MIN_ROOMS,
  buildSongDeduper,
  pickIdentity,
  promoteDemand,
  qualifies,
} from "../../lib/corpusPromote";
import type { SongProposalDoc } from "../../lib/mongodb";
import { songKeyFor } from "../../lib/songEntry";
import { suggestionCatalog, type CatalogEntry } from "../../lib/suggestionCatalog";

const songs = () => collection("karaoke_songs");
const proposals = () => collection("song_proposals");

const FIRST_SEEN = new Date("2026-09-01T00:00:00Z");

function proposal(over: Partial<SongProposalDoc> = {}): SongProposalDoc {
  return {
    _id: "sig",
    label: "The Agadiers - Mag Dungan Ta",
    candidates: [
      { artist: "Mag Dungan Ta", title: "The Agadiers" },
      { artist: "The Agadiers", title: "Mag Dungan Ta" },
    ],
    videoIds: ["v1"],
    addCount: 3,
    rooms: 1,
    addsByCountry: { PH: 3 },
    firstSeenAt: FIRST_SEEN,
    updatedAt: FIRST_SEEN,
    ...over,
  };
}

beforeEach(() => {
  collections.forEach((c) => c.clear());
});

describe("qualifies", () => {
  it("qualifies at the room threshold", () => {
    expect(qualifies(proposal({ rooms: PROMOTE_MIN_ROOMS }))).toBe(true);
  });

  it("does not qualify on 2 rooms in 1 country", () => {
    expect(qualifies(proposal({ rooms: 2, addsByCountry: { PH: 5 } }))).toBe(false);
  });

  it("qualifies on breadth across countries with at least 1 room", () => {
    expect(
      qualifies(
        proposal({ rooms: 1, addsByCountry: { PH: 1 }, searchesByCountry: { DE: 1 } })
      )
    ).toBe(true);
    expect(PROMOTE_MIN_COUNTRIES).toBe(2);
  });

  it("never auto-promotes search-only evidence, however wide its reach", () => {
    expect(
      qualifies(
        proposal({
          rooms: 0,
          addsByCountry: {},
          searchRooms: 10,
          searchesByCountry: { PH: 1, DE: 1, FR: 1 },
        })
      )
    ).toBe(false);
  });

  it("never qualifies a rejected proposal, breadth or not", () => {
    expect(qualifies(proposal({ rooms: 99, status: "rejected" }))).toBe(false);
  });

  it("always qualifies an approved proposal, even with no rooms", () => {
    expect(
      qualifies(proposal({ rooms: 0, addsByCountry: {}, status: "approved" }))
    ).toBe(true);
  });
});

describe("pickIdentity", () => {
  it("drops filler and channel-brand parts before choosing", () => {
    expect(
      pickIdentity(
        proposal({
          label: "Sweet Caroline - Neil Diamond | Karaoke Version | KaraFun",
          knownArtist: "Neil Diamond",
        })
      )
    ).toEqual({ artist: "Neil Diamond", title: "Sweet Caroline" });
  });

  it("matches knownArtist by token coverage, not string equality", () => {
    expect(
      pickIdentity(
        proposal({
          label: "Ben&Ben feat. Moira - Pagtingin",
          knownArtist: "Ben&Ben",
        })
      )
    ).toEqual({ artist: "Ben&Ben feat. Moira", title: "Pagtingin" });
  });

  it("returns null for a label with three real parts", () => {
    expect(pickIdentity(proposal({ label: "Alpha - Beta - Gamma" }))).toBeNull();
  });

  it("picks the tail as the artist with no knownArtist", () => {
    expect(pickIdentity(proposal())).toEqual({
      artist: "Mag Dungan Ta",
      title: "The Agadiers",
    });
  });

  it("returns null for a label with no separator at all", () => {
    expect(pickIdentity(proposal({ label: "Some Title Only" }))).toBeNull();
  });
});

describe("buildSongDeduper", () => {
  it("catches a re-worded match via the claim matcher", () => {
    const packKey = songKeyFor("The Cranberries", "Zombie");
    const deduper = buildSongDeduper([
      { _id: packKey, title: "Zombie", artist: "The Cranberries" } as any,
    ]);

    expect(deduper.find("Cranberries", "Zombie")).toBe(packKey);
  });

  it("registers a native-keyed pack song's reversed reading as a duplicate", () => {
    const entry: CatalogEntry = Array.from(suggestionCatalog().values()).find(
      (e) => e.nativeArtist && e.nativeTitle
    )!;
    const deduper = buildSongDeduper([
      {
        _id: entry.key,
        title: entry.title,
        artist: entry.artist,
        nativeTitle: entry.nativeTitle,
        nativeArtist: entry.nativeArtist,
      } as any,
    ]);

    expect(deduper.find(entry.nativeTitle!, entry.nativeArtist!)).toBe(entry.key);
  });

  it("finds nothing for a song it was never told about", () => {
    const deduper = buildSongDeduper([]);
    expect(deduper.find("Nobody", "Knows This One")).toBeNull();
  });
});

describe("promoteDemand", () => {
  it("creates a cutless demand song with no wantedIn and stamps the proposal", async () => {
    proposals().seed(proposal({ rooms: PROMOTE_MIN_ROOMS }));

    const { report } = await promoteDemand(Date.now() + 10_000);

    expect(report).toMatchObject({ scanned: 1, promoted: 1 });
    const key = songKeyFor("Mag Dungan Ta", "The Agadiers");
    const song = songs().get(key);
    expect(song).toMatchObject({ cuts: [], origin: "demand", demand: 0 });
    expect(song.wantedIn).toBeUndefined();
    expect(proposals().get("sig")).toMatchObject({
      promoteOutcome: "promoted",
      promotedSongId: key,
    });
  });

  it("stamps an unnamed row instead of leaving it to be rescanned", async () => {
    proposals().seed(proposal({ rooms: PROMOTE_MIN_ROOMS, label: "Alpha - Beta - Gamma" }));

    const first = await promoteDemand(Date.now() + 10_000);
    expect(first.report).toMatchObject({ scanned: 1, unnamed: 1 });

    const second = await promoteDemand(Date.now() + 10_000);
    expect(second.report.scanned).toBe(0);
    expect(proposals().get("sig")).toMatchObject({ promoteOutcome: "unnamed" });
  });

  it("treats a differently-worded match of an existing pack song as a duplicate", async () => {
    const entry: CatalogEntry = Array.from(suggestionCatalog().values())[0];
    songs().seed({
      _id: entry.key,
      title: entry.title,
      artist: entry.artist,
      cuts: [],
      addCount: 0,
      addsByCountry: {},
      demand: 0,
    });
    proposals().seed(
      proposal({
        _id: "dup-sig",
        label: `${entry.title} - ${entry.artist}`,
        rooms: PROMOTE_MIN_ROOMS,
      })
    );

    const { report } = await promoteDemand(Date.now() + 10_000);

    expect(report).toMatchObject({ scanned: 1, duplicates: 1, promoted: 0 });
    expect(songs().all()).toHaveLength(1);
    expect(proposals().get("dup-sig")).toMatchObject({
      promoteOutcome: "duplicate",
      promotedSongId: entry.key,
    });
  });

  it("the query itself keeps dead rows from ever filling the quota", async () => {
    for (let i = 0; i < 80; i++) {
      proposals().seed(
        proposal({
          _id: `rejected-${i}`,
          rooms: 100,
          status: "rejected",
          label: `Rejected Song ${i} - Rejected Artist ${i}`,
        })
      );
    }
    for (let i = 0; i < 80; i++) {
      proposals().seed(
        proposal({
          _id: `unnamed-${i}`,
          rooms: 100,
          label: "Karaoke Version",
          promoteOutcome: "unnamed",
          promotedAt: FIRST_SEEN,
        })
      );
    }
    proposals().seed(
      proposal({
        _id: "the-one",
        label: "Some Song - Some Artist",
        rooms: 0,
        addsByCountry: {},
        status: "approved",
      })
    );

    const { report } = await promoteDemand(Date.now() + 10_000);

    expect(report).toMatchObject({ scanned: 1, promoted: 1 });
    expect(proposals().get("the-one")).toMatchObject({ promoteOutcome: "promoted" });

    const again = await promoteDemand(Date.now() + 10_000);
    expect(again.report.scanned).toBe(0);
  });

  it("writes nothing once the run is out of clock", async () => {
    proposals().seed(proposal({ rooms: PROMOTE_MIN_ROOMS }));

    const { done, report } = await promoteDemand(Date.now() - 1);

    expect(done).toBe(false);
    expect(report.scanned).toBe(0);
    expect(songs().all()).toHaveLength(0);
  });
});
