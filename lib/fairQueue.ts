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
// Identity is the singer's name folded through singerKey (below) — renaming a
// singer changes their grouping, which is accepted; nothing re-sorts on
// rename. An entry's "round" is how many of that singer's songs were queued
// earlier: everyone's first is round 0, their second is round 1. Round-robin
// order = ascending round, queue time within a round. That is what spaces a
// singer out — queue two in a row and the second becomes round 1, which sits
// behind the round 0 of everyone who joins before it plays.
//
// Duets: a name like "Anna & Bob" is split into members (singerKeys, below)
// and the entry takes the round of its LEAST-served member — a first-timer's
// duet lands where the first-timer's own first song would, even when their
// partner has sung all night. Anna joining Bob's turn must never push Bob
// behind the regulars. In exchange the duet spends a turn for EVERY member:
// once it's queued, each member's next song counts one round later. (Yes, a
// regular could invent a fresh partner to ride round 0 — the same trick a
// brand-new solo name buys. With no accounts, names on the big screen and the
// host's remove button are the enforcement.)
//
// Both helpers operate on `upcoming = queue.slice(activeVideoIndex)`. The
// entry at index 0 is the song on stage: it counts toward its singer's rounds
// (so whoever is singing can't also own the next slot) but it never moves.
// History (queue.slice(0, activeVideoIndex)) never participates — turns are done.

// Built with `new RegExp` rather than literals: tsconfig targets es5, which
// rejects the `u` flag at compile time even though every runtime this ships
// to (Node, and browsers since 2018) supports Unicode property escapes.
const COMBINING_MARKS = new RegExp("\\p{M}+", "gu");
const NOT_LETTER_OR_DIGIT = new RegExp("[^\\p{L}\\p{N}]+", "gu");

/**
 * The identity two queue entries are compared on: same key, same singer.
 *
 * Singers have no accounts — the name is free text they can retype between
 * songs — so the cheapest way to skip the rotation is to queue again as
 * "anna", "Anna." or "A n n a" and land back at round 0. Folding case,
 * accents, punctuation and spacing away closes off that whole family of
 * near-miss names without needing an identity model.
 *
 * The fold is deliberately Unicode-aware: a plain [^a-z0-9] strip would erase
 * Japanese, Korean and Cyrillic names down to the empty string and collapse
 * every one of them into a single singer. Only marks, punctuation and spacing
 * are removed; letters and digits of every script survive.
 *
 * This is a grouping key only — the displayed name is never touched. Two real
 * people whose names differ only by spacing or case (rare) will share a
 * rotation slot; the host's inline rename is the escape hatch.
 */
export function singerKey(userName: string): string {
  const folded = userName
    // Split accents off their base letters so José and Jose fold together.
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    // Anything that is not a letter or digit goes, spacing included: the
    // spaces in "A n n a" are exactly the trick this is here to defeat.
    .replace(NOT_LETTER_OR_DIGIT, "");
  // A name made entirely of symbols ("🎤") folds to nothing. Keep those
  // distinct from each other rather than bucketing every one together.
  return folded || userName.trim();
}

// What reads as "two people on one mic": "Anna & Bob", "anna and bob",
// "Anna+Bob", "Anna, Bob, Cara". Matched BEFORE the singerKey fold — the fold
// strips punctuation, so an unsplit duet would collapse into one composite
// singer ("annabob") that matches neither partner and quietly restarts at
// round 0. "and" only splits as a whole word (Sandy and Brandy survive), and
// only in English: localized joiners ("dan", "at", "og") are single letters or
// short words too likely to sit inside real names, so a non-English pair is
// treated as one singer — exactly the behavior every pair had before duets.
const DUET_SEPARATORS = new RegExp("\\s*(?:[&+,]|\\band\\b)\\s*", "iu");

/**
 * The identities singing a queue entry: one key per member for a duet/group
 * name, or the singer's own key for everything else.
 *
 * Each member is folded through singerKey, so "ANNA. & b o b" is the same
 * pair as "Anna & Bob" and a duet can't dodge the near-miss folding its
 * members are subject to solo. Members that fold to nothing are dropped, a
 * self-duet ("Anna & anna") collapses to a solo, and a name with no usable
 * split (or none at all) falls back to the whole-name key — a symbol-only
 * name keeps the identity it always had.
 */
export function singerKeys(userName: string): string[] {
  const members = Array.from(
    new Set(
      userName
        .split(DUET_SEPARATORS)
        .map(singerKey)
        .filter((k) => k.length > 0)
    )
  );
  return members.length > 0 ? members : [singerKey(userName)];
}

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

/** The round an entry by `members` takes given how many turns each member has
 * had so far, and the tally update that goes with it: the least-served member
 * sets the round (a duet rides its newcomer's slot), and the turn is charged
 * to every member (nobody's next song stays cheap because they shared a mic). */
function takeRound(counts: Map<string, number>, members: string[]): number {
  let round = Infinity;
  for (const m of members) round = Math.min(round, counts.get(m) ?? 0);
  for (const m of members) counts.set(m, (counts.get(m) ?? 0) + 1);
  return round;
}

/** Each entry's round, counted positionally over the list as it stands. */
function roundsOf(upcoming: QueueEntry[]): number[] {
  const counts = new Map<string, number>();
  return upcoming.map((e) => takeRound(counts, singerKeys(e.userName)));
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

  // The song on stage is its singers' round 0 — every member of it, so
  // neither half of an on-stage duet can also own the next slot.
  const counts = new Map<string, number>();
  for (const m of singerKeys(current.userName)) counts.set(m, 1);
  const rounds = byArrival.map((e) => takeRound(counts, singerKeys(e.userName)));

  return [current, ...sortByKey(byArrival, rounds)];
}

/** Where a NEW song by `userName` slots into an already-fair `upcoming`: the
 * new song is round k (for a solo, how many songs they already have upcoming;
 * for a duet, the least-served member's count — see takeRound), and it goes at
 * the index of the first entry whose round exceeds k — i.e. to the END of its
 * round, behind same-round entries that were queued earlier. Never returns 0
 * for a non-empty list, so the song on stage is never displaced. */
export function fairInsertIndex(upcoming: QueueEntry[], userName: string): number {
  const counts = new Map<string, number>();
  const rounds = upcoming.map((e) => takeRound(counts, singerKeys(e.userName)));
  const k = takeRound(counts, singerKeys(userName));
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
