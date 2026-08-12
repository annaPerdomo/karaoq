import { describe, it, expect } from "vitest";
import { classifySearchInput } from "../../lib/videoLink";

const ID = "dQw4w9WgXcQ";
const OTHER_ID = "aB3_-xYz9Qw";

describe("classifySearchInput — video URLs", () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `http://youtube.com/watch?v=${ID}`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}`,
  ])("resolves %s to its video", (url) => {
    expect(classifySearchInput(url)).toEqual({ kind: "video", id: ID, from: "url" });
  });

  it("ignores an uppercase host", () => {
    expect(classifySearchInput(`HTTPS://WWW.YOUTUBE.COM/watch?v=${ID}`)).toEqual({
      kind: "video",
      id: ID,
      from: "url",
    });
  });

  it("ignores share/timestamp junk on the query string", () => {
    expect(
      classifySearchInput(`https://youtu.be/${ID}?t=42&si=AbCdEf`)
    ).toEqual({ kind: "video", id: ID, from: "url" });
    expect(
      classifySearchInput(`https://www.youtube.com/watch?v=${ID}&t=90s&feature=share`)
    ).toEqual({ kind: "video", id: ID, from: "url" });
  });

  it("resolves a playlist-context watch link to the video it points at", () => {
    expect(
      classifySearchInput(`https://www.youtube.com/watch?v=${ID}&list=PL123abc&index=4`)
    ).toEqual({ kind: "video", id: ID, from: "url" });
  });

  it("tolerates trailing whitespace from a paste", () => {
    expect(classifySearchInput(`  https://youtu.be/${OTHER_ID}  `)).toEqual({
      kind: "video",
      id: OTHER_ID,
      from: "url",
    });
  });
});

describe("classifySearchInput — scheme-less YouTube links", () => {
  it.each([
    `youtube.com/watch?v=${ID}`,
    `www.youtube.com/watch?v=${ID}`,
    `m.youtube.com/watch?v=${ID}`,
    `youtu.be/${ID}`,
  ])("rescues %s rather than text-searching it", (input) => {
    expect(classifySearchInput(input)).toEqual({ kind: "video", id: ID, from: "url" });
  });

  it("classifies a scheme-less playlist link as a YouTube non-video link", () => {
    expect(classifySearchInput("youtube.com/playlist?list=PL123abc")).toEqual({
      kind: "youtube-url",
    });
  });
});

describe("classifySearchInput — bare video ids", () => {
  it("accepts an exact 11-character id", () => {
    expect(classifySearchInput(ID)).toEqual({ kind: "video", id: ID, from: "bare" });
    expect(classifySearchInput(`  ${OTHER_ID} `)).toEqual({
      kind: "video",
      id: OTHER_ID,
      from: "bare",
    });
  });
});

describe("classifySearchInput — YouTube links with no single video", () => {
  it.each([
    "https://www.youtube.com/playlist?list=PL123abc",
    "https://youtube.com/@somechannel",
    "https://www.youtube.com/c/SomeChannel/videos",
    "https://www.youtube.com/watch",
    "https://www.youtube.com/watch?list=PL123abc",
    // A v= that isn't a plausible video id must not be looked up.
    "https://www.youtube.com/watch?v=short10chr",
    "https://youtu.be/tooshort",
    "https://www.youtube.com",
  ])("rejects %s", (url) => {
    expect(classifySearchInput(url)).toEqual({ kind: "youtube-url" });
  });
});

describe("classifySearchInput — other URLs", () => {
  it.each([
    "https://vimeo.com/123456",
    "http://www.tiktok.com/@someone/video/123",
    "https://example.com/foo",
  ])("classifies %s as a non-YouTube link", (url) => {
    expect(classifySearchInput(url)).toEqual({ kind: "url" });
  });
});

describe("classifySearchInput — ordinary text", () => {
  it.each([
    "bohemian rhapsody",
    // No scheme and not YouTube-shaped: could be a genuine query.
    "example.com/foo",
    "abcdefghij", // 10 characters
    "abcdefghijkl", // 12 characters
    "",
    "   ",
    "mailto:someone@example.com",
  ])("classifies %j as text", (input) => {
    expect(classifySearchInput(input)).toEqual({ kind: "text" });
  });
});
