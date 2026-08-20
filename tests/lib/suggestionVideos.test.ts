import { describe, it, expect } from "vitest";

import { pinTopFirst } from "../../lib/suggestionVideos";

function row(videoId: string) {
  return { title: `Song ${videoId}`, thumbnailUrl: "t", videoId };
}

describe("pinTopFirst", () => {
  it("moves the community's pick to the top and badges it", () => {
    const pinned = pinTopFirst([row("a"), row("b"), row("c")], "b");

    expect(pinned.map((r) => r.videoId)).toEqual(["b", "a", "c"]);
    expect(pinned[0].pinned).toBe(true);
    // Only the winner is badged, or the marker would mean nothing.
    expect(pinned.slice(1).some((r) => r.pinned)).toBe(false);
  });

  it("keeps the list intact when nothing has been picked yet", () => {
    const results = [row("a"), row("b")];

    expect(pinTopFirst(results, undefined)).toEqual(results);
  });

  it("ignores a pick the list no longer holds", () => {
    // A refresh can drop a deleted video; the badge must not point at a row
    // that isn't there, and the list must not lose one either.
    const results = [row("a"), row("b")];

    expect(pinTopFirst(results, "gone")).toEqual(results);
  });

  it("doesn't duplicate the pick it promotes", () => {
    const pinned = pinTopFirst([row("a"), row("b")], "a");

    expect(pinned).toHaveLength(2);
    expect(pinned.filter((r) => r.videoId === "a")).toHaveLength(1);
  });
});
