import { QueueEntry } from "../pages/api/types";

// Both arrangements (arrivalOrder / fairOrder) derive from `addedAt`, not array position: fair
// rotation rewrites the array, so deriving from queue time is what keeps the toggle reversible.

// `new RegExp` because the es5 target rejects the `u` flag in literals; every shipped runtime supports it.
const COMBINING_MARKS = new RegExp("\\p{M}+", "gu");
const NOT_LETTER_OR_DIGIT = new RegExp("[^\\p{L}\\p{N}]+", "gu");

/** Grouping key (display name untouched): folds case/accents/punctuation/spacing so near-miss
 * retypes ("anna", "Anna.", "A n n a") can't restart the rotation. Unicode-aware — a plain
 * [^a-z0-9] strip would erase non-Latin names to "" and collapse them into one singer. */
export function singerKey(userName: string): string {
  const folded = userName
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(NOT_LETTER_OR_DIGIT, "");
  // Symbol-only names ("🎤") fold to nothing; keep them distinct rather than bucketing them together.
  return folded || userName.trim();
}

// Matched BEFORE the singerKey fold — the fold strips these separators, collapsing an unsplit duet
// into one composite singer. "and" splits only as a whole English word: localized joiners sit inside too many real names.
const DUET_SEPARATORS = new RegExp("\\s*(?:[&+,]|\\band\\b)\\s*", "iu");

/** One singerKey per duet/group member, else the singer's own key. Empty folds drop, a self-duet
 * collapses to a solo, and no usable split falls back to the whole-name key. */
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

/** True when two credits name at least one singer in common — "Anna" is in
 * "Anna & Bo", and so is the pair itself. Both sides must be folded the same
 * way: comparing a whole name against per-member keys never matches a duet. */
export function sharesSinger(a: string, b: string): boolean {
  if (!a.trim() || !b.trim()) return false;
  const keys = new Set(singerKeys(b));
  return singerKeys(a).some((key) => keys.has(key));
}

function sortByKey<T>(items: T[], keys: number[]): T[] {
  return items
    .map((item, i) => ({ item, key: keys[i], i }))
    .sort((a, b) => a.key - b.key || a.i - b.i)
    .map((x) => x.item);
}

/** Queue time per entry. Legacy entries without `addedAt` inherit the last known time, so a stable
 * sort leaves their relative order alone instead of reshuffling an all-legacy queue. */
function arrivalKeys(list: QueueEntry[]): number[] {
  let last = 0;
  return list.map((e) => {
    if (typeof e.addedAt === "number" && Number.isFinite(e.addedAt)) {
      last = e.addedAt;
    }
    return last;
  });
}

/** The least-served member sets the round (a duet rides its newcomer's slot); the turn is charged
 * to every member. */
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

/** Invent `addedAt` from current position for legacy entries. Must run BEFORE any reorder — at that
 * moment the array still is the arrival order. Returns the original array when nothing was stamped. */
export function withArrivalTimes(upcoming: QueueEntry[]): QueueEntry[] {
  let last = 0;
  let stamped = false;
  const out = upcoming.map((e) => {
    if (typeof e.addedAt === "number" && Number.isFinite(e.addedAt)) {
      last = Math.max(last, e.addedAt);
      return e;
    }
    // Strictly increasing — ties would collapse back to whatever order the array is in.
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

  // Rank by queue time first so a round means "their nth-earliest song", not current array order.
  const byArrival = sortByKey(rest, arrivalKeys(rest));

  // The on-stage song is round 0 for every one of its singers, so none can also own the next slot.
  const counts = new Map<string, number>();
  for (const m of singerKeys(current.userName)) counts.set(m, 1);
  const rounds = byArrival.map((e) => takeRound(counts, singerKeys(e.userName)));

  return [current, ...sortByKey(byArrival, rounds)];
}

/** Fair slot for a NEW song in an already-fair `upcoming`: the end of its round. Never returns 0
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

/** `$push` spec for `entry`'s fair slot. Callers must CAS on the same `queue` snapshot passed here —
 * `$position` is only right for the exact array the index was computed against. */
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
