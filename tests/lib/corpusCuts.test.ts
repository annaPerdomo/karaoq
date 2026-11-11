import { describe, it, expect, vi, beforeEach } from "vitest";

const videos = { findOne: vi.fn() };
vi.mock("../../lib/mongodb", () => ({
  getKaraokeVideosCollection: async () => videos,
}));

const readSongCutsMock = vi.fn();
vi.mock("../../lib/corpusRead", () => ({
  readSongCuts: (...args: unknown[]) => readSongCutsMock(...args),
}));

const findSongForQueryMock = vi.fn();
vi.mock("../../lib/corpusLookup", () => ({
  findSongForQuery: (...args: unknown[]) => findSongForQueryMock(...args),
}));

import { playableCutsFor, refusalSongQuery, REFUSAL_CUT_LIMIT } from "../../lib/corpusCuts";

const cut = (n: number) => ({ videoId: `cut${String(n).padStart(8, "0")}`, title: `Cut ${n}`, thumbnailUrl: "t" });

beforeEach(() => {
  vi.clearAllMocks();
  videos.findOne.mockResolvedValue(null);
  findSongForQueryMock.mockResolvedValue(null);
  readSongCutsMock.mockResolvedValue(null);
});

describe("playableCutsFor", () => {
  it("uses the video's own song key before the title", async () => {
    videos.findOne.mockResolvedValue({ _id: "refused0000", songKeys: ["abba waterloo"] });
    readSongCutsMock.mockResolvedValue([cut(1)]);

    expect(await playableCutsFor("refused0000", "ABBA - Waterloo")).toEqual([cut(1)]);
    expect(readSongCutsMock).toHaveBeenCalledWith("abba waterloo");
    expect(findSongForQueryMock).not.toHaveBeenCalled();
  });

  it("falls back to the formatted title", async () => {
    findSongForQueryMock.mockResolvedValue("abba dancing queen");
    readSongCutsMock.mockResolvedValue([cut(1)]);

    expect(await playableCutsFor("refused0000", "ABBA - Dancing Queen @StingrayKaraoke")).toEqual([cut(1)]);
    expect(findSongForQueryMock).toHaveBeenCalledWith("ABBA - Dancing Queen");
    expect(readSongCutsMock).toHaveBeenCalledWith("abba dancing queen");
  });

  it("excludes the refused id and caps the list", async () => {
    findSongForQueryMock.mockResolvedValue("k");
    const refused = { ...cut(0), videoId: "refused0000" };
    readSongCutsMock.mockResolvedValue([cut(1), refused, cut(2), cut(3), cut(4), cut(5), cut(6), cut(7)]);

    const out = await playableCutsFor("refused0000", "Song");

    expect(out).toHaveLength(REFUSAL_CUT_LIMIT);
    expect(out.map((c) => c.videoId)).not.toContain("refused0000");
    expect(out[0]).toEqual(cut(1));
  });

  it("returns nothing when no song matches or it has no cuts", async () => {
    expect(await playableCutsFor("refused0000", "Song")).toEqual([]);
    expect(readSongCutsMock).not.toHaveBeenCalled();

    findSongForQueryMock.mockResolvedValue("k");
    expect(await playableCutsFor("refused0000", "Song")).toEqual([]);
  });

  it("returns nothing when a read rejects", async () => {
    videos.findOne.mockRejectedValue(new Error("down"));
    expect(await playableCutsFor("refused0000", "Song")).toEqual([]);

    videos.findOne.mockResolvedValue({ songKeys: ["k"] });
    readSongCutsMock.mockRejectedValue(new Error("down"));
    expect(await playableCutsFor("refused0000", "Song")).toEqual([]);
  });
});

describe("refusalSongQuery", () => {
  it.each([
    ["ABBA - Dancing Queen (Official Music Video)", "ABBA - Dancing Queen"],
    ["Dancing Queen | ABBA", "Dancing Queen"],
    ["Rise Up - Andra Day | Karaoke Version | KaraFun", "Rise Up - Andra Day"],
    ["Suavemente (Merengue) - Elvis Crespo | Versión Karaoke | KaraFun", "Suavemente - Elvis Crespo"],
    ["| Odd", "Odd"],
    ["Adele - Hello (Official Video) #adele", "Adele - Hello"],
    ["Queen - Bohemian Rhapsody [Remastered 2011] HD", "Queen - Bohemian Rhapsody"],
  ])("cleans %j", (title, expected) => {
    const out = refusalSongQuery(title);
    expect(out).toBe(expected);
    expect(out).not.toMatch(/["|#()[\]]/);
  });
});
