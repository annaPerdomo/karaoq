import { describe, it, expect } from "vitest";
import { QueueEntry } from "../../pages/api/types";
import { fairOrder, fairInsertIndex } from "../../lib/fairQueue";

let seq = 0;
function entry(userName: string): QueueEntry {
  seq += 1;
  return {
    id: `e${seq}`,
    userName,
    songTitle: `Song ${seq}`,
    videoId: "dQw4w9WgXcQ",
  };
}

describe("fairOrder", () => {
  it("interleaves singers round-robin (worked example)", () => {
    // upcoming [A1, A2, B1, C1, A3] → rounds [0, 1, 0, 0, 2] → [A1, B1, C1, A2, A3]
    const [a1, a2, b1, c1, a3] = [
      entry("A"),
      entry("A"),
      entry("B"),
      entry("C"),
      entry("A"),
    ];
    expect(fairOrder([a1, a2, b1, c1, a3])).toEqual([a1, b1, c1, a2, a3]);
  });

  it("is a no-op for a single singer", () => {
    const songs = [entry("A"), entry("A"), entry("A")];
    expect(fairOrder(songs)).toEqual(songs);
  });

  it("handles an empty list", () => {
    expect(fairOrder([])).toEqual([]);
  });

  it("is a no-op when every singer is distinct", () => {
    const songs = [entry("A"), entry("B"), entry("C"), entry("D")];
    expect(fairOrder(songs)).toEqual(songs);
  });

  it("preserves arrival order within a round (stability)", () => {
    // Second-round songs keep their relative order: A2 was queued before B2.
    const [a1, b1, a2, b2] = [entry("A"), entry("B"), entry("A"), entry("B")];
    expect(fairOrder([a1, b1, a2, b2])).toEqual([a1, b1, a2, b2]);
    // ...and when B's second song arrived first, it stays ahead of A's.
    const [a1b, b1b, b2b, a2b] = [entry("A"), entry("B"), entry("B"), entry("A")];
    expect(fairOrder([a1b, b1b, b2b, a2b])).toEqual([a1b, b1b, b2b, a2b]);
  });

  it("treats names differing only by case as different singers", () => {
    const [anna1, ANNA, anna2] = [entry("anna"), entry("ANNA"), entry("anna")];
    // "ANNA" is its own singer: round 0, so it stays ahead of anna's round-1 song.
    expect(fairOrder([anna1, anna2, ANNA])).toEqual([anna1, ANNA, anna2]);
  });

  it("groups by trimmed name", () => {
    const [a1, a2, b1] = [entry("Anna"), entry(" Anna "), entry("Bob")];
    // " Anna " is round 1 of Anna, so Bob's round-0 song moves ahead of it.
    expect(fairOrder([a1, a2, b1])).toEqual([a1, b1, a2]);
  });
});

describe("fairInsertIndex", () => {
  it("slots a new song at the end of its round (worked example)", () => {
    // Sorted upcoming [A1, B1, C1, A2, A3]; B's new song is round 1 → the
    // first round-2 entry is A3 at index 4.
    const sorted = [entry("A"), entry("B"), entry("C"), entry("A"), entry("A")];
    expect(fairInsertIndex(sorted, "B")).toBe(4);
  });

  it("inserts into an empty upcoming list at 0", () => {
    expect(fairInsertIndex([], "A")).toBe(0);
  });

  it("appends when the singer starts a new last round", () => {
    // A already has the most songs — their next one belongs at the tail.
    const sorted = [entry("A"), entry("B"), entry("A")];
    expect(fairInsertIndex(sorted, "A")).toBe(3);
  });

  it("places a first-time singer after the other round-0 songs", () => {
    const sorted = [entry("A"), entry("B"), entry("A")];
    // C's first song is round 0 → before A's round-1 song at index 2.
    expect(fairInsertIndex(sorted, "C")).toBe(2);
  });

  it("matches singers by trimmed name", () => {
    const sorted = [entry("A"), entry("B")];
    // " A " trims to "A", who already has one upcoming song → round 1 → tail.
    expect(fairInsertIndex(sorted, " A ")).toBe(2);
  });

  it("treats case-different names as new singers", () => {
    const sorted = [entry("a"), entry("a")];
    // "A" has no songs yet → round 0 → before a's round-1 song at index 1.
    expect(fairInsertIndex(sorted, "A")).toBe(1);
  });
});
