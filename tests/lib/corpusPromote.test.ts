import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
  REPAIR_ID,
  approveProposal,
  buildArtistEvidence,
  buildSongDeduper,
  cleanIdentityPart,
  parseIdentityOverride,
  pickIdentity,
  promoteDemand,
  qualifies,
  rejectProposal,
  repairDemandIdentities,
} from "../../lib/corpusPromote";
import type { SongProposalDoc } from "../../lib/mongodb";
import { songKeyFor } from "../../lib/songEntry";
import { suggestionCatalog, type CatalogEntry } from "../../lib/suggestionCatalog";

const songs = () => collection("karaoke_songs");
const proposals = () => collection("song_proposals");
const videos = () => collection("karaoke_videos");
const state = () => collection("cron_state");

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

  it("matches knownArtist by token coverage, not string equality, after cleaning a feat. credit", () => {
    expect(
      pickIdentity(
        proposal({
          label: "Ben&Ben feat. Moira - Pagtingin",
          knownArtist: "Ben&Ben",
        })
      )
    ).toEqual({ artist: "Ben&Ben", title: "Pagtingin" });
  });

  it("doesn't let a short knownArtist name claim an unrelated, much longer phrase", () => {
    // "Frozen" sits inside this phrase without the phrase being an artist
    // credit — it's a title plus the show it's from plus channel branding.
    expect(
      pickIdentity(
        proposal({
          label:
            '"Let It Go" from Frozen: The Broadway Musical - Karaoke Track with Lyrics on Screen',
          knownArtist: "Frozen",
        })
      )
    ).toBeNull();
  });

  it("returns null for a label with three real parts", () => {
    expect(pickIdentity(proposal({ label: "Alpha - Beta - Gamma" }))).toBeNull();
  });

  it("returns null with no knownArtist and no evidence, rather than guessing by position", () => {
    expect(pickIdentity(proposal())).toBeNull();
  });

  it("returns null for a label with no separator at all", () => {
    expect(pickIdentity(proposal({ label: "Some Title Only" }))).toBeNull();
  });

  describe("with evidence", () => {
    function evidenceFor(
      input: Partial<{
        songs: { artist: string; nativeArtist?: string; origin?: string }[];
        proposals: { candidates: { artist: string; title: string }[] }[];
      }>
    ) {
      return buildArtistEvidence({ songs: [], proposals: [], ...input });
    }

    it("picks the side a pack/chart artist backs, either reading", () => {
      const evidence = evidenceFor({ songs: [{ artist: "Michael Jackson" }] });

      expect(
        pickIdentity(proposal({ label: "Michael Jackson - Thriller" }), evidence)
      ).toEqual({ artist: "Michael Jackson", title: "Thriller" });
      expect(
        pickIdentity(proposal({ label: "Thriller - Michael Jackson" }), evidence)
      ).toEqual({ artist: "Michael Jackson", title: "Thriller" });
    });

    it("never names a side on recurrence alone, however many proposals repeat it", () => {
      const evidence = evidenceFor({
        proposals: [
          { candidates: [{ artist: "Pimpinela", title: "Song One" }] },
          { candidates: [{ artist: "Pimpinela", title: "Song Two" }] },
          { candidates: [{ artist: "Pimpinela", title: "Song Three" }] },
        ],
      });

      expect(
        pickIdentity(
          proposal({ label: "Pimpinela - Olvidame Y Pega La Vuelta" }),
          evidence
        )
      ).toBeNull();
    });

    it("recurrence breaks a tie between two sides a pack/chart artist already backs", () => {
      const evidence = evidenceFor({
        songs: [{ artist: "Michael Jackson" }, { artist: "Thriller" }],
        proposals: [
          { candidates: [{ artist: "Thriller", title: "Michael Jackson" }] },
          { candidates: [{ artist: "Smooth Criminal", title: "Michael Jackson" }] },
        ],
      });

      // Both sides clear the pack/chart floor at 10; "Michael Jackson" recurs
      // across two proposal labels against Thriller's one, which breaks the tie.
      expect(
        pickIdentity(proposal({ label: "Michael Jackson - Thriller" }), evidence)
      ).toEqual({ artist: "Michael Jackson", title: "Thriller" });
    });

    it("returns null when neither side has pack/chart evidence", () => {
      const evidence = evidenceFor({
        proposals: [{ candidates: [{ artist: "A", title: "B" }] }],
      });
      expect(
        pickIdentity(proposal({ label: "Nobody Known - Also Unknown" }), evidence)
      ).toBeNull();
    });

    it("knownArtist still wins over evidence", () => {
      const evidence = evidenceFor({ songs: [{ artist: "Michael Jackson" }] });
      expect(
        pickIdentity(
          proposal({ label: "Michael Jackson - Thriller", knownArtist: "Thriller" }),
          evidence
        )
      ).toEqual({ artist: "Thriller", title: "Michael Jackson" });
    });
  });
});

describe("cleanIdentityPart", () => {
  it("drops a trailing channel word even after the bracket in front of it is removed", () => {
    expect(cleanIdentityPart("Back to Black Karaoke")).toBe("Back to Black");
  });

  it("drops a filler bracket and the trailing word it exposes", () => {
    expect(cleanIdentityPart("Rihanna Karaoke 【No Guide Melody】 Instrumental")).toBe(
      "Rihanna"
    );
  });

  it("drops a parenthetical that is only branding", () => {
    expect(cleanIdentityPart("FEU (Paroles)")).toBe("FEU");
  });

  it("strips a featuring credit", () => {
    expect(cleanIdentityPart("Justin Bieber ft. Ludacris")).toBe("Justin Bieber");
  });

  it("keeps a part that is only filler, rather than returning empty", () => {
    expect(cleanIdentityPart("Karaoke")).toBe("Karaoke");
  });

  it("drops filler at the start of a real title (this pack's rule: trim both ends, never mid)", () => {
    expect(cleanIdentityPart("Karaoke Love Song")).toBe("Love Song");
  });

  it("decodes HTML entities before anything else", () => {
    expect(cleanIdentityPart("THAT&#39;S WHAT FRIENDS ARE FOR")).toBe(
      "THAT'S WHAT FRIENDS ARE FOR"
    );
    expect(cleanIdentityPart("Carlos Baute &amp; Marta Sanchez")).toBe(
      "Carlos Baute & Marta Sanchez"
    );
    expect(cleanIdentityPart('&quot;bodys&quot;')).toBe('"bodys"');
  });

  it("accepts both 'no guide melody' and 'with guide melody'", () => {
    expect(
      cleanIdentityPart("Shawn Mendes Karaoke 【With Guide Melody】 Instrumental")
    ).toBe("Shawn Mendes");
    expect(
      cleanIdentityPart("Rihanna Karaoke 【No Guide Melody】 Instrumental")
    ).toBe("Rihanna");
  });

  it("treats mr/off/vocal/track/minus/one as filler only inside their fixed phrase", () => {
    expect(cleanIdentityPart("Mr Brightside")).toBe("Mr Brightside");
    expect(cleanIdentityPart("Off My Face")).toBe("Off My Face");
    expect(cleanIdentityPart("MR KUPIDO")).toBe("MR KUPIDO");
    expect(cleanIdentityPart("Treat You Better Off Vocal")).toBe("Treat You Better");
    expect(cleanIdentityPart("Mr Removed Thriller")).toBe("Thriller");
    expect(cleanIdentityPart("Thriller Backing Track")).toBe("Thriller");
    expect(cleanIdentityPart("Thriller Minus One")).toBe("Thriller");
  });

  it("never leaves con/y dangling from a Spanish branding phrase", () => {
    expect(cleanIdentityPart("Amor Del Bueno Con Letra")).toBe("Amor Del Bueno");
    expect(cleanIdentityPart("Instrumental Y Letra Amargo Adios")).toBe("Amargo Adios");
  });

  it("strips Feat/Ft without a trailing dot", () => {
    expect(cleanIdentityPart("Justin Bieber Feat Ludacris")).toBe("Justin Bieber");
    expect(cleanIdentityPart("Justin Bieber Ft Ludacris")).toBe("Justin Bieber");
  });

  it("drops a trailing channel/brand tail before the two-part check", () => {
    expect(
      pickIdentity(
        proposal({
          label: "Treat You Better - Shawn Mendes - Karaoke Version from Zoom Karaoke",
          knownArtist: "Shawn Mendes",
        })
      )
    ).toEqual({ artist: "Shawn Mendes", title: "Treat You Better" });
  });

  it("never drops 'from' as a real title's own first word", () => {
    expect(cleanIdentityPart("From This Moment On")).toBe("From This Moment On");
  });

  it("never leaves a dangling bracket: trims through the matching opener or leaves the part unchanged", () => {
    expect(cleanIdentityPart("FANNY J (Guyane")).toBe("FANNY J (Guyane");
    expect(cleanIdentityPart("FANNY J (Guyane Karaoke)")).toBe("FANNY J (Guyane Karaoke)");
    expect(cleanIdentityPart("Treat You Better (Karaoke)")).toBe("Treat You Better");
  });
});

describe("buildArtistEvidence", () => {
  it("scores a pack or chart song's artist at least 10", () => {
    const evidence = buildArtistEvidence({
      songs: [{ artist: "Adele", origin: undefined }, { artist: "Drake", origin: "chart" }],
      proposals: [],
    });
    expect(evidence.score("Adele")).toBeGreaterThanOrEqual(10);
    expect(evidence.score("Drake")).toBeGreaterThanOrEqual(10);
  });

  it("never scores a demand song's own artist", () => {
    const evidence = buildArtistEvidence({
      songs: [{ artist: "Some Demand Act", origin: "demand" }],
      proposals: [],
    });
    expect(evidence.score("Some Demand Act")).toBe(0);
  });

  it("counts the first-credited artist of a multi-act credit", () => {
    const evidence = buildArtistEvidence({
      songs: [{ artist: "Drake & Don Toliver", origin: undefined }],
      proposals: [],
    });
    expect(evidence.score("Drake")).toBeGreaterThanOrEqual(10);
  });

  it("packScore counts only pack/chart credit, never proposal recurrence", () => {
    const evidence = buildArtistEvidence({
      songs: [{ artist: "Adele", origin: undefined }],
      proposals: [
        { candidates: [{ artist: "Pimpinela", title: "Song One" }] },
        { candidates: [{ artist: "Pimpinela", title: "Song Two" }] },
      ],
    });
    expect(evidence.packScore("Adele")).toBeGreaterThanOrEqual(10);
    expect(evidence.packScore("Pimpinela")).toBe(0);
    expect(evidence.score("Pimpinela")).toBeGreaterThan(0);
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
    proposals().seed(proposal({ rooms: PROMOTE_MIN_ROOMS, knownArtist: "Mag Dungan Ta" }));

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
        knownArtist: "Some Artist",
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

describe("approveProposal", () => {
  it("promotes with the picked identity", async () => {
    proposals().seed(proposal({ rooms: 0, addsByCountry: {}, knownArtist: "Mag Dungan Ta" }));

    const outcome = await approveProposal("sig");

    const key = songKeyFor("Mag Dungan Ta", "The Agadiers");
    expect(outcome).toMatchObject({ result: "promoted", songId: key });
    expect(songs().get(key)).toMatchObject({ origin: "demand" });
    expect(proposals().get("sig")).toMatchObject({
      status: "approved",
      promoteOutcome: "promoted",
      promotedSongId: key,
    });
  });

  it("uses the override identity instead of pickIdentity", async () => {
    proposals().seed(proposal({ rooms: 0, addsByCountry: {} }));

    const outcome = await approveProposal("sig", { artist: "Someone Else", title: "Another Title" });

    const key = songKeyFor("Someone Else", "Another Title");
    expect(outcome).toMatchObject({ result: "promoted", songId: key });
    expect(songs().get(key)).toMatchObject({
      title: "Another Title",
      artist: "Someone Else",
    });
  });

  it("returns duplicate and creates nothing for an identity that already exists", async () => {
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
        label: `${entry.title} - ${entry.artist}`,
        knownArtist: entry.artist,
        rooms: 0,
        addsByCountry: {},
      })
    );

    const outcome = await approveProposal("sig");

    expect(outcome).toMatchObject({ result: "duplicate", songId: entry.key });
    expect(songs().all()).toHaveLength(1);
  });

  it("returns null for an unknown id", async () => {
    expect(await approveProposal("missing")).toBeNull();
  });

  it("re-approving an already-promoted proposal writes nothing", async () => {
    const key = songKeyFor("Mag Dungan Ta", "The Agadiers");
    proposals().seed(
      proposal({ promoteOutcome: "promoted", promotedSongId: key, status: "approved" })
    );

    const outcome = await approveProposal("sig");

    expect(outcome).toEqual({ result: "promoted", songId: key });
    expect(songs().all()).toHaveLength(0);
  });
});

describe("rejectProposal", () => {
  it("deletes a promoted demand song and pulls its key from video songKeys", async () => {
    proposals().seed(proposal({ rooms: 0, addsByCountry: {}, knownArtist: "Mag Dungan Ta" }));
    const key = songKeyFor("Mag Dungan Ta", "The Agadiers");
    await approveProposal("sig");
    videos().seed({ _id: "v1", title: "x", thumbnailUrl: "", songKeys: [key, "other"] } as any);

    const outcome = await rejectProposal("sig");

    expect(outcome).toMatchObject({ result: "rejected", removedSongId: key });
    expect(songs().get(key)).toBeNull();
    expect(videos().get("v1")).toMatchObject({ songKeys: ["other"] });
    expect(proposals().get("sig")).toMatchObject({ status: "rejected" });
    expect(proposals().get("sig").promotedSongId).toBeUndefined();
  });

  it("never deletes the song a different proposal owns, even one it matched as a duplicate", async () => {
    proposals().seed(
      proposal({ _id: "a", rooms: 0, addsByCountry: {}, knownArtist: "Mag Dungan Ta" })
    );
    const key = songKeyFor("Mag Dungan Ta", "The Agadiers");
    await approveProposal("a");

    proposals().seed(
      proposal({
        _id: "b",
        label: "The Agadiers - Mag Dungan Ta",
        knownArtist: "Mag Dungan Ta",
        rooms: 0,
        addsByCountry: {},
      })
    );
    await approveProposal("b");
    expect(proposals().get("b")).toMatchObject({ promoteOutcome: "duplicate", promotedSongId: key });

    const outcome = await rejectProposal("b");

    expect(outcome).toMatchObject({ result: "rejected" });
    expect(outcome?.removedSongId).toBeUndefined();
    expect(songs().get(key)).not.toBeNull();
  });

  it("deletes nothing when the promoted song is a pack song", async () => {
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
      proposal({ promoteOutcome: "promoted", promotedSongId: entry.key })
    );

    const outcome = await rejectProposal("sig");

    expect(outcome).toMatchObject({ result: "rejected" });
    expect(outcome?.removedSongId).toBeUndefined();
    expect(songs().get(entry.key)).not.toBeNull();
  });

  it("returns null for an unknown id", async () => {
    expect(await rejectProposal("missing")).toBeNull();
  });
});

describe("parseIdentityOverride", () => {
  it("accepts neither field as no override", () => {
    expect(parseIdentityOverride(undefined, undefined)).toEqual({ ok: true });
  });

  it("accepts a valid pair", () => {
    expect(parseIdentityOverride("The Cranberries", "Zombie")).toEqual({
      ok: true,
      identity: { artist: "The Cranberries", title: "Zombie" },
    });
  });

  it("rejects one field given alone", () => {
    expect(parseIdentityOverride("The Cranberries", undefined).ok).toBe(false);
    expect(parseIdentityOverride(undefined, "Zombie").ok).toBe(false);
  });

  it("rejects a non-string field", () => {
    expect(parseIdentityOverride(123, "Zombie").ok).toBe(false);
  });

  it("rejects whitespace- or punctuation-only fields", () => {
    expect(parseIdentityOverride("   ", "Zombie").ok).toBe(false);
    expect(parseIdentityOverride("---", "Zombie").ok).toBe(false);
  });

  it("rejects a field over 200 characters", () => {
    expect(parseIdentityOverride("a".repeat(201), "Zombie").ok).toBe(false);
  });
});

describe("repairDemandIdentities", () => {
  const prevVercelEnv = process.env.VERCEL_ENV;
  beforeEach(() => {
    process.env.VERCEL_ENV = "production";
  });
  afterEach(() => {
    process.env.VERCEL_ENV = prevVercelEnv;
  });

  function demandSong(id: string, artist: string, title: string, over: Partial<any> = {}) {
    return {
      _id: id,
      title,
      artist,
      cuts: [],
      addCount: 0,
      addsByCountry: {},
      demand: 0,
      origin: "demand",
      ...over,
    };
  }

  it("keeps a song whose proposal still picks the same identity today", async () => {
    const key = songKeyFor("Michael Jackson", "Thriller");
    proposals().seed(
      proposal({
        _id: "p1",
        label: "Michael Jackson - Thriller",
        knownArtist: "Michael Jackson",
        promoteOutcome: "promoted",
        promotedSongId: key,
      })
    );
    songs().seed(demandSong(key, "Michael Jackson", "Thriller", { proposalId: "p1" }));

    const { report } = await repairDemandIdentities(Date.now() + 10_000);

    expect(report).toMatchObject({ kept: 1, deleted: 0, reset: 0 });
    expect(songs().get(key)).not.toBeNull();
    expect(proposals().get("p1")).toMatchObject({ promoteOutcome: "promoted" });
  });

  it("keeps a null-pick song that already has real cuts, but deletes one with none", async () => {
    proposals().seed(proposal({ _id: "p1", label: "Alpha - Beta - Gamma" }));
    proposals().seed(proposal({ _id: "p2", label: "Delta - Epsilon - Zeta" }));
    songs().seed(demandSong("has-cuts", "Alpha", "Beta", { proposalId: "p1", cuts: ["v1"] }));
    songs().seed(demandSong("no-cuts", "Delta", "Epsilon", { proposalId: "p2", cuts: [] }));

    const { report } = await repairDemandIdentities(Date.now() + 10_000);

    expect(report).toMatchObject({ kept: 1, deleted: 1, reset: 1 });
    expect(songs().get("has-cuts")).not.toBeNull();
    expect(songs().get("no-cuts")).toBeNull();
  });

  it("deletes a song whose identity no longer matches its proposal's pick, pulling its key from videos and resetting the proposal", async () => {
    const wrongKey = songKeyFor("Thriller", "Michael Jackson"); // swapped
    proposals().seed(
      proposal({
        _id: "p1",
        label: "Michael Jackson - Thriller",
        knownArtist: "Michael Jackson",
        promoteOutcome: "promoted",
        promotedSongId: wrongKey,
      })
    );
    songs().seed(demandSong(wrongKey, "Thriller", "Michael Jackson", { proposalId: "p1" }));
    videos().seed({
      _id: "v1",
      title: "x",
      thumbnailUrl: "",
      songKeys: [wrongKey, "other"],
    } as any);

    const { report } = await repairDemandIdentities(Date.now() + 10_000);

    expect(report).toMatchObject({ kept: 0, deleted: 1, reset: 1 });
    expect(songs().get(wrongKey)).toBeNull();
    expect(videos().get("v1")).toMatchObject({ songKeys: ["other"] });
    expect(proposals().get("p1").promoteOutcome).toBeUndefined();
    expect(proposals().get("p1").promotedSongId).toBeUndefined();
  });

  it("leaves a pack song with the same artist untouched", async () => {
    proposals().seed(proposal({ _id: "p1", label: "Alpha - Beta - Gamma" }));
    songs().seed(demandSong("demand-1", "Michael Jackson", "Thriller", { proposalId: "p1" }));
    songs().seed({
      _id: "pack-1",
      title: "Beat It",
      artist: "Michael Jackson",
      cuts: [],
      addCount: 0,
      addsByCountry: {},
      demand: 0,
    });

    await repairDemandIdentities(Date.now() + 10_000);

    expect(songs().get("pack-1")).not.toBeNull();
  });

  it("resets a duplicate proposal pointing at a deleted song, but not one with status set", async () => {
    proposals().seed(proposal({ _id: "owner", label: "Alpha - Beta - Gamma" }));
    songs().seed(demandSong("demand-1", "X", "Y", { proposalId: "owner", cuts: [] }));
    proposals().seed(
      proposal({ _id: "dup-open", promoteOutcome: "duplicate", promotedSongId: "demand-1" })
    );
    proposals().seed(
      proposal({
        _id: "dup-ruled",
        promoteOutcome: "duplicate",
        promotedSongId: "demand-1",
        status: "approved",
      })
    );

    const { report } = await repairDemandIdentities(Date.now() + 10_000);

    expect(report.reset).toBe(2); // owner + dup-open
    expect(proposals().get("dup-open").promoteOutcome).toBeUndefined();
    expect(proposals().get("dup-ruled")).toMatchObject({ promoteOutcome: "duplicate" });
  });

  it("does nothing outside production", async () => {
    process.env.VERCEL_ENV = "preview";
    proposals().seed(proposal({ _id: "p1", label: "Alpha - Beta - Gamma" }));
    songs().seed(demandSong("demand-1", "X", "Y", { proposalId: "p1", cuts: [] }));

    const { done, report } = await repairDemandIdentities(Date.now() + 10_000);

    expect(done).toBe(true);
    expect(report.skipped).toBe("not production");
    expect(songs().get("demand-1")).not.toBeNull();
  });

  it("is idempotent: a second run is skipped", async () => {
    songs().seed(demandSong("demand-1", "Michael Jackson", "Thriller"));

    const first = await repairDemandIdentities(Date.now() + 10_000);
    expect(first.done).toBe(true);
    expect(first.report.skipped).toBeUndefined();

    const second = await repairDemandIdentities(Date.now() + 10_000);
    expect(second.done).toBe(true);
    expect(second.report.skipped).toBe(true);
  });

  it("resumes from its cursor after the deadline cuts a run short", async () => {
    for (let i = 0; i < 3; i++) songs().seed(demandSong(`demand-${i}`, "X", "Y"));

    const cut = await repairDemandIdentities(Date.now() - 1);
    expect(cut.done).toBe(false);
    expect(songs().all()).toHaveLength(3);
    expect(state().get(REPAIR_ID)).toMatchObject({ cursor: "" });

    const finished = await repairDemandIdentities(Date.now() + 10_000);
    expect(finished.done).toBe(true);
    expect(songs().all()).toHaveLength(0);
  });
});
