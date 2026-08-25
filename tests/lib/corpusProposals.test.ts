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
  clusterProposals,
  proposalSignature,
  proposalTokens,
  proposeUnmappedAdds,
  titleCandidates,
} from "../../lib/corpusProposals";
import type { KaraokeVideoDoc } from "../../lib/mongodb";

const videos = () => collection("karaoke_videos");
const proposals = () => collection("song_proposals");

const LAST_AT = new Date("2026-08-23T04:00:00Z");

function video(
  id: string,
  title: string,
  opts: { rooms?: string[]; count?: number; byCountry?: Record<string, number> } = {}
): KaraokeVideoDoc {
  return {
    _id: id,
    title,
    thumbnailUrl: "",
    sources: {
      adds: {
        count: opts.count ?? 1,
        byCountry: opts.byCountry ?? { PH: opts.count ?? 1 },
        rooms: opts.rooms ?? [`room-${id}`],
        lastAt: LAST_AT,
      },
    },
    firstSeenAt: LAST_AT,
    refreshedAt: LAST_AT,
  } as KaraokeVideoDoc;
}

beforeEach(() => {
  collections.forEach((c) => c.clear());
});

describe("proposal clustering", () => {
  it("files a branded upload under the bare title of the same song", () => {
    const [cluster, ...rest] = clusterProposals([
      video("a", "Mag Dungan ta - The Agadiers (Karaoke Songs with lyrics - Original key)", {
        rooms: ["r1"],
      }),
      video("b", "The Agadiers - Mag Dungan Ta", { rooms: ["r2"] }),
    ]);
    expect(rest).toHaveLength(0);
    // The shorter title is the identity; the branded one joined it.
    expect(cluster.label).toBe("The Agadiers - Mag Dungan Ta");
    expect(cluster.videoIds.sort()).toEqual(["a", "b"]);
    expect(cluster.rooms).toBe(2);
  });

  it("keeps two songs by one artist apart", () => {
    const clusters = clusterProposals([
      video("a", "The Agadiers - GUGMA [Karaoke Version]"),
      video("b", "Magkita ra ta Puhon - The Agadiers (Karaoke)"),
    ]);
    expect(clusters).toHaveLength(2);
  });

  it("keeps same-titled songs by different artists apart", () => {
    const clusters = clusterProposals([
      video("a", "DREAM ON - Nazareth (HD Karaoke)"),
      video("b", "Black Sabbath - Dream On (karaoke version)"),
    ]);
    expect(clusters).toHaveLength(2);
  });

  it("will not let a two-word core swallow a longer title", () => {
    // {agadiers, gugma} is inside the second title, but two words are a phrase,
    // not an identity — only an exact match may join it.
    const clusters = clusterProposals([
      video("a", "The Agadiers - GUGMA [Karaoke Version]"),
      video("b", "GUGMA nga Walay Katapusan - The Agadiers duet (Karaoke)"),
    ]);
    expect(clusters).toHaveLength(2);
  });

  it("merges a two-word core on an exact match whichever way round it is written", () => {
    const clusters = clusterProposals([
      video("a", "The Agadiers - GUGMA [Karaoke Version]", { rooms: ["r1"] }),
      video("b", "GUGMA - The Agadiers (HD Karaoke)", { rooms: ["r2"] }),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].rooms).toBe(2);
  });

  it("counts a room once however many videos of the song it added", () => {
    const clusters = clusterProposals([
      video("a", "The Agadiers - Mag Dungan Ta", { rooms: ["r1"], count: 3 }),
      video("b", "The Agadiers - Mag Dungan Ta (Karaoke Version)", {
        rooms: ["r1"],
        count: 2,
      }),
    ]);
    expect(clusters[0].rooms).toBe(1);
    expect(clusters[0].addCount).toBe(5);
  });

  it("sums the countries a cluster was added from", () => {
    const clusters = clusterProposals([
      video("a", "Duelo - Malabares (Karaoke)", { byCountry: { MX: 2 }, count: 2 }),
      video("b", "Duelo - Malabares karaoke version", { byCountry: { MX: 1, US: 1 }, count: 2 }),
    ]);
    expect(clusters[0].addsByCountry).toEqual({ MX: 3, US: 1 });
  });

  it("ranks by rooms before raw adds", () => {
    const clusters = clusterProposals([
      video("a", "Siakol - Tropa (Karaoke)", { rooms: ["r1"], count: 50 }),
      video("b", "Cueshe - Pangako (Karaoke)", { rooms: ["r1", "r2"], count: 2 }),
    ]);
    expect(clusters.map((c) => c.label)).toEqual([
      "Cueshe - Pangako",
      "Siakol - Tropa",
    ]);
  });

  it("names the catalog artist when the gap is the song, not the act", () => {
    const [cluster] = clusterProposals([
      video("a", "SA SUSUNOD NA HABANG BUHAY - Ben&Ben (KARAOKE VERSION)"),
    ]);
    expect(cluster.knownArtist).toBe("Ben&Ben");
  });

  it("leaves knownArtist unset for an act the catalog has never carried", () => {
    const [cluster] = clusterProposals([
      video("a", "The Agadiers - GUGMA [Karaoke Version]"),
    ]);
    expect(cluster.knownArtist).toBeUndefined();
  });

  it("drops a title too short to identify anything", () => {
    expect(proposalTokens("Karaoke")).toEqual([]);
    expect(clusterProposals([video("a", "(Karaoke Version)")])).toHaveLength(0);
  });

  it("keys on the words, not their order", () => {
    expect(proposalSignature(["b", "a"])).toBe(proposalSignature(["a", "b"]));
  });
});

describe("title candidates", () => {
  it("offers both readings of a separated title", () => {
    expect(titleCandidates("The Agadiers - Mag Dungan Ta")).toEqual([
      { artist: "Mag Dungan Ta", title: "The Agadiers" },
      { artist: "The Agadiers", title: "Mag Dungan Ta" },
    ]);
  });

  it("keeps punctuation inside a name out of the split", () => {
    expect(titleCandidates("Ben&Ben - Pagtingin")[1]).toEqual({
      artist: "Ben&Ben",
      title: "Pagtingin",
    });
    expect(titleCandidates("Jay-R Siaboc - Hiling")[1].artist).toBe("Jay-R Siaboc");
  });

  it("offers one reading when nothing separates the halves", () => {
    expect(titleCandidates("Karaoke Panteon Rococo Arreglame El Alma")).toEqual([
      { artist: "", title: "Karaoke Panteon Rococo Arreglame El Alma" },
    ]);
  });
});

describe("proposeUnmappedAdds", () => {
  const deadline = () => Date.now() + 10_000;

  it("proposes only adds no catalog entry claimed", async () => {
    videos().seed(video("a", "The Agadiers - Mag Dungan Ta"));
    videos().seed({ ...video("b", "ABBA - Dancing Queen (Karaoke)"), songKeys: ["abba dancing queen karaoke"] });
    videos().seed({ ...video("c", "Journey - Don't Stop Believin' (Karaoke)"), songKeys: [] });

    const { report } = await proposeUnmappedAdds(deadline());
    expect(report.scanned).toBe(2);
    const written = proposals().all();
    expect(written.map((p) => p.label).sort()).toEqual([
      "Journey - Don't Stop Believin'",
      "The Agadiers - Mag Dungan Ta",
    ]);
  });

  it("ignores a video no room ever added", async () => {
    videos().seed({
      _id: "h",
      title: "Sing King - Someone Like You (Karaoke)",
      thumbnailUrl: "t",
      sources: { harvest: { channel: "SingKing", matchedAt: LAST_AT } },
      firstSeenAt: LAST_AT,
      refreshedAt: LAST_AT,
    } as any);
    const { report } = await proposeUnmappedAdds(deadline());
    expect(report.scanned).toBe(0);
    expect(proposals().all()).toHaveLength(0);
  });

  it("counts the ones a second room seconded", async () => {
    videos().seed(video("a", "The Agadiers - Mag Dungan Ta", { rooms: ["r1", "r2"] }));
    videos().seed(video("b", "Siakol - Tropa (Karaoke)", { rooms: ["r1"] }));
    const { report } = await proposeUnmappedAdds(deadline());
    expect(report.clustered).toBe(2);
    expect(report.seconded).toBe(1);
  });

  it("keeps a ruling and the date it was first seen across runs", async () => {
    videos().seed(video("a", "The Agadiers - Mag Dungan Ta", { count: 1 }));
    await proposeUnmappedAdds(deadline());
    const [first] = proposals().all();
    proposals().seed({ ...first, status: "rejected" });

    videos().seed(video("a", "The Agadiers - Mag Dungan Ta", { count: 9 }));
    await proposeUnmappedAdds(deadline());
    const [again] = proposals().all();
    expect(again.status).toBe("rejected");
    expect(again.firstSeenAt).toEqual(first.firstSeenAt);
    // Evidence is re-derived even on a proposal already ruled on.
    expect(again.addCount).toBe(9);
  });

  it("re-derives evidence rather than accumulating it", async () => {
    videos().seed(video("a", "The Agadiers - Mag Dungan Ta", { count: 4 }));
    await proposeUnmappedAdds(deadline());
    expect(proposals().all()[0].addCount).toBe(4);
    // The second video expired out of karaoke_videos; the count follows it down.
    videos().clear();
    videos().seed(video("a", "The Agadiers - Mag Dungan Ta", { count: 2 }));
    await proposeUnmappedAdds(deadline());
    expect(proposals().all()[0].addCount).toBe(2);
  });

  it("reports more work when the scan filled its limit", async () => {
    videos().seed(video("a", "The Agadiers - Mag Dungan Ta"));
    videos().seed(video("b", "Siakol - Tropa (Karaoke)"));
    expect((await proposeUnmappedAdds(deadline(), 2)).done).toBe(false);
    expect((await proposeUnmappedAdds(deadline(), 5)).done).toBe(true);
  });

  it("writes nothing once the run is out of clock", async () => {
    videos().seed(video("a", "The Agadiers - Mag Dungan Ta"));
    const { done, report } = await proposeUnmappedAdds(Date.now() - 1);
    expect(done).toBe(false);
    expect(report.scanned).toBe(0);
    expect(proposals().all()).toHaveLength(0);
  });
});

describe("near-coverage merging", () => {
  it("joins one song whose two titles differ by a stray word", () => {
    const clusters = clusterProposals([
      video("a", "Hakuna Matata (from The Lion King) Karaoke", { rooms: ["r1"] }),
      video("b", "The Lion King - Hakuna Matata Karaoke with Lyrics On Screen", {
        rooms: ["r2"],
      }),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].rooms).toBe(2);
  });

  it("still parts two songs that merely share most of a short title", () => {
    // "dream on" is two words of three either way; only the act differs.
    expect(
      clusterProposals([
        video("a", "DREAM ON - Nazareth (HD Karaoke)"),
        video("b", "Black Sabbath - Dream On (karaoke version)"),
      ])
    ).toHaveLength(2);
  });

  it("refuses a merge that would add more words than branding ever does", () => {
    const clusters = clusterProposals([
      video("a", "Bread - Aubrey (Karaoke)"),
      video(
        "b",
        "Bread - Aubrey Everything I Own If Diary Make It With You Baby I'm A Want You (Karaoke Medley)"
      ),
    ]);
    expect(clusters).toHaveLength(2);
  });
});

describe("re-derived hints", () => {
  it("clears a knownArtist the catalog no longer backs", async () => {
    const title = "The Agadiers - GUGMA [Karaoke Version]";
    const signature = proposalSignature(proposalTokens(title));
    // The state a run leaves behind when the catalog still carried the act.
    proposals().seed({
      _id: signature,
      label: "The Agadiers - GUGMA",
      knownArtist: "The Agadiers",
      firstSeenAt: LAST_AT,
      updatedAt: LAST_AT,
    });
    videos().seed(video("a", title));

    await proposeUnmappedAdds(Date.now() + 10_000);
    const [held] = proposals().all();
    expect(held._id).toBe(signature);
    expect(held.knownArtist).toBeUndefined();
    expect(held.firstSeenAt).toEqual(LAST_AT);
  });

  it("keeps a knownArtist the catalog still backs", async () => {
    videos().seed(video("a", "SA SUSUNOD NA HABANG BUHAY - Ben&Ben (KARAOKE VERSION)"));
    await proposeUnmappedAdds(Date.now() + 10_000);
    expect(proposals().all()[0].knownArtist).toBe("Ben&Ben");
  });
});
