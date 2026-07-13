import { describe, it, expect } from "vitest";
import formatSongTitle, { stripChannel } from "../../lib/songTitle";

describe("stripChannel", () => {
  it("drops a trailing channel handle", () => {
    expect(
      stripChannel("Whitney Houston - I Will Always Love You (Karaoke With Lyrics) @StingrayKaraoke")
    ).toBe("Whitney Houston - I Will Always Love You (Karaoke With Lyrics)");
  });

  it("takes the separator that introduced the handle with it", () => {
    expect(stripChannel("Sweet Caroline - Karaoke Version | @KaraFun")).toBe(
      "Sweet Caroline - Karaoke Version"
    );
    expect(stripChannel("Mr. Brightside (Karaoke) - @SingKing")).toBe(
      "Mr. Brightside (Karaoke)"
    );
    expect(stripChannel("Africa (Karaoke) • @Toto")).toBe("Africa (Karaoke)");
  });

  it("drops more than one trailing handle", () => {
    expect(stripChannel("Dancing Queen (Karaoke) @KaraFun @KaraokeVersion")).toBe(
      "Dancing Queen (Karaoke)"
    );
  });

  it("keeps the karaoke information that matters", () => {
    const title = "Bohemian Rhapsody - Queen | Karaoke Version | Lower Key @KaraFun";
    expect(stripChannel(title)).toBe("Bohemian Rhapsody - Queen | Karaoke Version | Lower Key");
  });

  it("leaves titles without a handle alone", () => {
    const title = "Sweet Caroline - Neil Diamond | Karaoke Version | KaraFun";
    expect(stripChannel(title)).toBe(title);
  });

  it("does not mistake an @ used as a word for a handle", () => {
    // A space after "@" means it isn't a handle.
    expect(stripChannel("Live @ Wembley (Karaoke)")).toBe("Live @ Wembley (Karaoke)");
  });

  it("only strips from the end, never mid-title", () => {
    expect(stripChannel("@StingrayKaraoke presents: Let It Go")).toBe(
      "@StingrayKaraoke presents: Let It Go"
    );
  });

  it("never strips a title down to nothing", () => {
    expect(stripChannel("@StingrayKaraoke")).toBe("@StingrayKaraoke");
  });

  it("keeps the group-song microphone prefix", () => {
    expect(stripChannel("🎤 One Day More (Karaoke) @KaraFun")).toBe("🎤 One Day More (Karaoke)");
  });
});

describe("formatSongTitle", () => {
  it("decodes HTML entities and strips the channel in one pass", () => {
    expect(formatSongTitle("Islands in the Stream &amp; More (Karaoke) @KaraFun")).toBe(
      "Islands in the Stream & More (Karaoke)"
    );
  });
});
