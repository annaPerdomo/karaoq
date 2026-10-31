import { describe, it, expect } from "vitest";
import { cleanSongTitle, originalVideoQuery, pickOriginalCandidates } from "../../lib/originalVideo";

describe("originalVideoQuery", () => {
  it("drops a karaoke version suffix", () => {
    expect(originalVideoQuery("Queen - Bohemian Rhapsody (Karaoke Version)")).toBe(
      "Queen - Bohemian Rhapsody official video"
    );
  });

  it("drops a lone trailing karaoke word", () => {
    expect(originalVideoQuery("Queen - Bohemian Rhapsody Karaoke")).toBe(
      "Queen - Bohemian Rhapsody official video"
    );
    expect(originalVideoQuery("Adele - Hello Karaoke")).toBe("Adele - Hello official video");
    expect(originalVideoQuery("Adele - Someone Like You Karaoke")).toBe(
      "Adele - Someone Like You official video"
    );
  });

  it("does not eat a real subtitle while dropping a trailing karaoke word", () => {
    expect(
      originalVideoQuery("Daft Punk - Get Lucky (feat. Pharrell Williams) KARAOKE")
    ).toContain("Get Lucky");
  });

  it("drops anything after a ' | ' suffix", () => {
    expect(originalVideoQuery("Dancing Queen | Karaoke Version | ABBA")).toBe(
      "Dancing Queen official video"
    );
  });

  it("skips a leading pipe segment that is only noise", () => {
    expect(originalVideoQuery("Karaoke Version | ABBA - Dancing Queen")).toBe(
      "ABBA - Dancing Queen official video"
    );
    expect(originalVideoQuery("KARAOKE | ABBA - Dancing Queen")).toBe(
      "ABBA - Dancing Queen official video"
    );
  });

  it("drops a known channel name and a trailing karaoke word along with a key bracket", () => {
    expect(
      originalVideoQuery("Sing King - Someone Like You (Lower Key) Karaoke")
    ).toBe("Someone Like You official video");
  });

  it("prefers the corpus artist/title over the queued title", () => {
    expect(
      originalVideoQuery("literally anything", { artist: "Queen", title: "Bohemian Rhapsody" })
    ).toBe("Queen Bohemian Rhapsody official video");
  });

  it("returns null when the title is only noise", () => {
    expect(originalVideoQuery("Karaoke Instrumental")).toBeNull();
  });

  it("does not strip words that merely contain a noise substring", () => {
    expect(originalVideoQuery("Undercover Of The Night")).toBe(
      "Undercover Of The Night official video"
    );
    expect(originalVideoQuery("Discovery")).toBe("Discovery official video");
    expect(originalVideoQuery("Coverdale")).toBe("Coverdale official video");
    expect(originalVideoQuery("Lyrical Lemonade")).toBe("Lyrical Lemonade official video");
  });

  it("strips non-Latin karaoke markers inside a bracket", () => {
    expect(originalVideoQuery("Цеца - Кукавица (КАРАОКЕ)")).toBe(
      "Цеца - Кукавица official video"
    );
    expect(originalVideoQuery("【カラオケ】 YOASOBI - アイドル")).toBe(
      "YOASOBI - アイドル official video"
    );
  });

  it("drops a bracket naming who originally performed the song", () => {
    expect(
      originalVideoQuery("Someone Like You (originally performed by Adele) Karaoke")
    ).toBe("Someone Like You official video");
  });
});

describe("pickOriginalCandidates", () => {
  const results = [
    { title: "Artist - Song (Karaoke Version)", thumbnailUrl: "t", videoId: "karaoke" },
    { title: "Artist - Song (Official Music Video)", thumbnailUrl: "t", videoId: "official1" },
    { title: "Artist - Song Lyrics", thumbnailUrl: "t", videoId: "lyrics" },
    { title: "Artist - Song (Official Audio)", thumbnailUrl: "t", videoId: "official2" },
    { title: "Artist - Song Cover by Someone", thumbnailUrl: "t", videoId: "cover" },
    { title: "Artist - Song Live", thumbnailUrl: "t", videoId: "live" },
  ];

  it("drops karaoke, lyrics and cover titles, and puts official titles first", () => {
    expect(pickOriginalCandidates(results)).toEqual(["official1", "official2", "live"]);
  });

  it("caps the result at max", () => {
    expect(pickOriginalCandidates(results, 2)).toEqual(["official1", "official2"]);
  });

  it("keeps a title whose noise word is only a substring", () => {
    const keep = [
      {
        title: "The Rolling Stones - Undercover Of The Night - OFFICIAL PROMO",
        thumbnailUrl: "t",
        videoId: "a",
      },
      {
        title: "Whitesnake (Official Music Video) | Coverdale",
        thumbnailUrl: "t",
        videoId: "b",
      },
    ];
    expect(pickOriginalCandidates(keep)).toEqual(["a", "b"]);
  });

  it("drops a non-Latin karaoke marker", () => {
    const mixed = [
      { title: "Цеца - Кукавица - (КАРАОКЕ)", thumbnailUrl: "t", videoId: "drop" },
      { title: "Цеца - Кукавица (Official Video)", thumbnailUrl: "t", videoId: "keep" },
    ];
    expect(pickOriginalCandidates(mixed)).toEqual(["keep"]);
  });
});

describe("cleanSongTitle", () => {
  it("drops the karaoke extras for display", () => {
    expect(cleanSongTitle("Bad Romance - Lady Gaga (Karaoke Songs With Lyrics - Original Key)")).toBe(
      "Bad Romance - Lady Gaga"
    );
  });

  it("returns null when only noise is left", () => {
    expect(cleanSongTitle("Karaoke Instrumental")).toBeNull();
  });
});
