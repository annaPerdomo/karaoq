import { describe, it, expect } from "vitest";
import { QueueEntry } from "../../pages/api/types";
import {
  arrivalOrder,
  fairOrder,
  fairInsertIndex,
  withArrivalTimes,
} from "../../lib/fairQueue";

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

/** An entry with an explicit queue time. */
function at(userName: string, addedAt: number): QueueEntry {
  return { ...entry(userName), addedAt };
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

describe("arrivalOrder", () => {
  it("restores the order songs were queued in", () => {
    const cur = at("X", 1);
    const [a1, a2, b1] = [at("A", 2), at("A", 3), at("B", 4)];
    // Sitting in fair order — arrivalOrder puts queue time back.
    expect(arrivalOrder([cur, a1, b1, a2])).toEqual([cur, a1, a2, b1]);
  });

  it("never moves the song on stage, even if it was queued last", () => {
    const cur = at("X", 99);
    const [a1, b1] = [at("A", 1), at("B", 2)];
    expect(arrivalOrder([cur, b1, a1])).toEqual([cur, a1, b1]);
  });

  it("leaves a queue with no recorded times in its current order", () => {
    // Entries queued before addedAt existed must not be reshuffled arbitrarily.
    const songs = [entry("A"), entry("B"), entry("A"), entry("C")];
    expect(arrivalOrder(songs)).toEqual(songs);
  });

  it("handles empty and single-song lists", () => {
    expect(arrivalOrder([])).toEqual([]);
    const one = [at("A", 1)];
    expect(arrivalOrder(one)).toEqual(one);
  });
});

describe("fairOrder — rounds come from queue time, not array position", () => {
  it("ranks a singer's songs by when they were queued, not where they sit", () => {
    // The host dragged A's second song to the top. A round must still mean
    // "their nth-earliest song", so A's FIRST song leads and the second falls
    // behind B.
    const cur = at("X", 1);
    const [a1, a2, b1] = [at("A", 2), at("A", 3), at("B", 4)];
    expect(fairOrder([cur, a2, a1, b1])).toEqual([cur, a1, b1, a2]);
  });

  it("is idempotent — re-running it does not churn the queue", () => {
    const cur = at("X", 1);
    const [a1, a2, a3, b1] = [at("A", 2), at("A", 3), at("A", 4), at("B", 5)];
    const once = fairOrder([cur, a1, a2, a3, b1]);
    expect(fairOrder(once)).toEqual(once);
  });

  it("round-trips through arrivalOrder and back", () => {
    const cur = at("X", 1);
    const original = [cur, at("A", 2), at("A", 3), at("B", 4), at("C", 5)];
    const fair = fairOrder(original);
    expect(fair).not.toEqual(original);
    expect(arrivalOrder(fair)).toEqual(original);
    expect(fairOrder(arrivalOrder(fair))).toEqual(fair);
  });

  it("makes a double-queuer wait for someone who joins later", () => {
    // A queues two back to back, then B joins. B must sing before A's second.
    const cur = at("X", 1);
    const [a1, a2, b1] = [at("A", 2), at("A", 3), at("B", 4)];
    const order = fairOrder([cur, a1, a2, b1]).map((e) => e.userName);
    expect(order).toEqual(["X", "A", "B", "A"]);
  });

  it("keeps the on-stage singer from owning the next slot", () => {
    const cur = at("A", 1);
    const [a2, b1] = [at("A", 2), at("B", 3)];
    // A is singing, so their next song is round 1 and B goes first.
    expect(fairOrder([cur, a2, b1])).toEqual([cur, b1, a2]);
  });
});

describe("withArrivalTimes", () => {
  it("stamps legacy entries with strictly increasing times", () => {
    const songs = [entry("A"), entry("B"), entry("A")];
    const stamped = withArrivalTimes(songs);
    const times = stamped.map((e) => e.addedAt!);
    expect(times.every((t, i) => i === 0 || t > times[i - 1])).toBe(true);
    expect(stamped.map((e) => e.id)).toEqual(songs.map((e) => e.id));
  });

  it("leaves an already-stamped queue untouched", () => {
    const songs = [at("A", 10), at("B", 20)];
    expect(withArrivalTimes(songs)).toBe(songs);
  });

  it("keeps stamped entries ordered after legacy ones", () => {
    const legacy = entry("A");
    const known = at("B", 5000);
    const [first, second] = withArrivalTimes([legacy, known]);
    expect(first.addedAt!).toBeLessThan(second.addedAt!);
  });

  it("lets a legacy queue round-trip once its times are recorded", () => {
    // Exactly the upgrade path: a room queued before addedAt existed gets
    // stamped on the first toggle, so turning the mode back off restores it.
    const original = withArrivalTimes([
      entry("A"), entry("A"), entry("B"), entry("C"),
    ]);
    const fair = fairOrder(original);
    expect(fair.map((e) => e.userName)).toEqual(["A", "B", "C", "A"]);
    expect(arrivalOrder(fair)).toEqual(original);
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
