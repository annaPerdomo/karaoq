import { QueueEntry } from "../pages/api/types";

// Fair-rotation math, shared by the fair-mode toggle route (re-sort in both
// directions) and the add-song routes (fair insertion while the mode is on).
//
// There are two arrangements of the same songs, and both are derived from
// `addedAt` (queue time) rather than from the current array order:
//
//   arrivalOrder — plain queue time. What the room looks like with fair
//                  rotation OFF.
//   fairOrder    — round-robin over queue time. What it looks like ON.
//
// Deriving both from queue time is what makes the toggle reversible: fair
// rotation rewrites the array, so array position stops being a record of who
// queued when. Reading the order back out of `addedAt` means off→on→off lands
// on exactly the two arrangements every time, however often the host flips it.
//
// Identity is the exact trimmed userName — renaming a singer changes their
// grouping, which is accepted; nothing re-sorts on rename. An entry's "round"
// is how many of that singer's songs were queued earlier: everyone's first is
// round 0, their second is round 1. Round-robin order = ascending round, queue
// time within a round. That is what spaces a singer out — queue two in a row
// and the second becomes round 1, which sits behind the round 0 of everyone
// who joins before it plays.
//
// Both helpers operate on `upcoming = queue.slice(activeVideoIndex)`. The
// entry at index 0 is the song on stage: it counts toward its singer's rounds
// (so whoever is singing can't also own the next slot) but it never moves.
// History (queue.slice(0, activeVideoIndex)) never participates — turns are done.

/** Stable sort by a numeric key. The index tiebreak makes stability explicit
 * rather than relying on the engine's sort. */
function sortByKey<T>(items: T[], keys: number[]): T[] {
  return items
    .map((item, i) => ({ item, key: keys[i], i }))
    .sort((a, b) => a.key - b.key || a.i - b.i)
    .map((x) => x.item);
}

/** Queue time per entry. Entries queued before `addedAt` existed inherit the
 * last known time, so they sort with the neighbours they already sit next to
 * and a stable sort leaves their relative order alone — an all-legacy queue
 * keeps its current order instead of being reshuffled arbitrarily. */
function arrivalKeys(list: QueueEntry[]): number[] {
  let last = 0;
  return list.map((e) => {
    if (typeof e.addedAt === "number" && Number.isFinite(e.addedAt)) {
      last = e.addedAt;
    }
    return last;
  });
}

/** How many of the same singer's songs precede each entry, positionally. */
function roundsOf(upcoming: QueueEntry[]): number[] {
  const counts = new Map<string, number>();
  return upcoming.map((e) => {
    const name = e.userName.trim();
    const round = counts.get(name) ?? 0;
    counts.set(name, round + 1);
    return round;
  });
}

/** Give every entry a real `addedAt`, invented from its current position for
 * songs queued before the field existed. The toggle route calls this BEFORE it
 * reorders anything: at that moment the array still is the arrival order, so
 * this is the last chance to record it. Without it a room full of legacy
 * entries could be spaced out but never put back. Returns the original array
 * untouched when there is nothing to stamp. */
export function withArrivalTimes(upcoming: QueueEntry[]): QueueEntry[] {
  let last = 0;
  let stamped = false;
  const out = upcoming.map((e) => {
    if (typeof e.addedAt === "number" && Number.isFinite(e.addedAt)) {
      last = Math.max(last, e.addedAt);
      return e;
    }
    // Strictly increasing, so the order survives as values rather than as
    // positions — ties would collapse back to whatever order the array is in.
    last += 1;
    stamped = true;
    return { ...e, addedAt: last };
  });
  return stamped ? out : upcoming;
}

/** Plain queue-time order — the arrangement fair rotation is turned OFF to. */
export function arrivalOrder(upcoming: QueueEntry[]): QueueEntry[] {
  if (upcoming.length <= 1) return upcoming.slice();
  const [current, ...rest] = upcoming;
  return [current, ...sortByKey(rest, arrivalKeys(rest))];
}

/** Round-robin re-sort of the upcoming list, by queue time within each round. */
export function fairOrder(upcoming: QueueEntry[]): QueueEntry[] {
  if (upcoming.length <= 1) return upcoming.slice();
  const [current, ...rest] = upcoming;

  // Rank by queue time first so a round means "their nth-earliest song",
  // not "their nth song in whatever order the array is in right now".
  const byArrival = sortByKey(rest, arrivalKeys(rest));

  // The song on stage is its singer's round 0, so their next song starts at
  // round 1 and falls in behind everyone else's first.
  const counts = new Map<string, number>([[current.userName.trim(), 1]]);
  const rounds = byArrival.map((e) => {
    const name = e.userName.trim();
    const round = counts.get(name) ?? 0;
    counts.set(name, round + 1);
    return round;
  });

  return [current, ...sortByKey(byArrival, rounds)];
}

/** Where a NEW song by `userName` slots into an already-fair `upcoming`: the
 * new song is round k (k = how many songs they already have upcoming), and it
 * goes at the index of the first entry whose round exceeds k — i.e. to the END
 * of its round, behind same-round entries that were queued earlier. Never
 * returns 0 for a non-empty list, so the song on stage is never displaced. */
export function fairInsertIndex(upcoming: QueueEntry[], userName: string): number {
  const name = userName.trim();
  const k = upcoming.filter((e) => e.userName.trim() === name).length;
  const rounds = roundsOf(upcoming);
  for (let i = 0; i < upcoming.length; i++) {
    if (rounds[i] > k) return i;
  }
  return upcoming.length;
}

/** The `$push` spec that puts `entry` at its fair slot in `queue`. Callers must
 * CAS on the same `queue` snapshot they pass here — `$position` is only right
 * for the exact array the index was computed against. */
export function fairPushSpec(
  queue: QueueEntry[],
  activeVideoIndex: number,
  entry: QueueEntry
): { $each: QueueEntry[]; $position: number } {
  const upcoming = queue.slice(activeVideoIndex);
  return {
    $each: [entry],
    $position: activeVideoIndex + fairInsertIndex(upcoming, entry.userName),
  };
}
