import { describe, it, expect } from "vitest";
import { buildNightRecap, NIGHT_WINDOW_MS } from "../../lib/nightRecap";
import { QueueEntry } from "../../pages/api/types";

const NOW = 1_700_000_000_000;

let seq = 0;
function entry(userName: string, addedAt: number = NOW): QueueEntry {
  seq += 1;
  return {
    id: `e${seq}`,
    userName,
    songTitle: `Song ${seq}`,
    videoId: "dQw4w9WgXcQ",
    addedAt,
  };
}

describe("buildNightRecap", () => {
  it("returns 0/0 for an empty queue", () => {
    expect(buildNightRecap([], 0, NOW)).toEqual({ songs: 0, singers: 0, star: undefined });
  });

  it("counts nothing as played when activeVideoIndex is -1", () => {
    const queue = [entry("Ana"), entry("Bo")];
    expect(buildNightRecap(queue, -1, NOW)).toEqual({ songs: 0, singers: 0, star: undefined });
  });

  it("treats a past-the-end index as the whole queue played", () => {
    const queue = [entry("Ana"), entry("Bo"), entry("Cat")];
    const recap = buildNightRecap(queue, queue.length, NOW);
    expect(recap.songs).toBe(3);
    expect(recap.singers).toBe(3);
  });

  it("includes the current entry when activeVideoIndex points at a valid one", () => {
    const queue = [entry("Ana"), entry("Bo"), entry("Cat")];
    const recap = buildNightRecap(queue, 1, NOW);
    expect(recap.songs).toBe(2);
    expect(recap.singers).toBe(2);
  });

  it("counts each duet member as their own singer", () => {
    const queue = [entry("Ana & Bo"), entry("Cat")];
    const recap = buildNightRecap(queue, 1, NOW);
    expect(recap.singers).toBe(3);
  });

  it("excludes a played entry from a previous night (outside the 12h window)", () => {
    const old = entry("Ana", NOW - NIGHT_WINDOW_MS - 1);
    const queue = [old, entry("Bo"), entry("Cat"), entry("Dee")];
    const recap = buildNightRecap(queue, queue.length, NOW);
    expect(recap.songs).toBe(3);
    expect(recap.singers).toBe(3);
  });

  it("excludes a played entry with no addedAt", () => {
    const noTime: QueueEntry = {
      id: "no-time",
      userName: "Ana",
      songTitle: "Song",
      videoId: "dQw4w9WgXcQ",
    };
    const queue = [noTime, entry("Bo"), entry("Cat"), entry("Dee")];
    const recap = buildNightRecap(queue, queue.length, NOW);
    expect(recap.songs).toBe(3);
    expect(recap.singers).toBe(3);
  });

  it("names a star with the original-case name when unique top of at least 2", () => {
    const queue = [entry("Ana"), entry("Ana"), entry("Bo")];
    const recap = buildNightRecap(queue, 2, NOW);
    expect(recap.star).toBe("Ana");
  });

  it("leaves star undefined when the top is a tie", () => {
    const queue = [entry("Ana"), entry("Bo"), entry("Ana"), entry("Bo")];
    const recap = buildNightRecap(queue, 3, NOW);
    expect(recap.star).toBeUndefined();
  });

  it("leaves star undefined when nobody has sung twice", () => {
    const queue = [entry("Ana"), entry("Bo"), entry("Cat")];
    const recap = buildNightRecap(queue, 2, NOW);
    expect(recap.star).toBeUndefined();
  });

  it("leaves star undefined when the top count only comes from duet credits", () => {
    const queue = [entry("Ana & Bo"), entry("Ana & Cat")];
    const recap = buildNightRecap(queue, 1, NOW);
    expect(recap.star).toBeUndefined();
  });
});
