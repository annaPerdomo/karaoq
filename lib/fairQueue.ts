import { QueueEntry } from "../pages/api/types";

// Fair-rotation math, shared by the fair-mode toggle route (one-time re-sort
// on enable) and the add-song route (fair insertion while the mode is on).
//
// Identity is the exact trimmed userName — renaming a singer changes their
// grouping, which is accepted; nothing re-sorts on rename. An entry's "round"
// is how many earlier entries in the same upcoming list belong to the same
// singer: everyone's first upcoming song is round 0, their second is round 1,
// and so on. Round-robin order = ascending round, arrival order within a round.
//
// Both helpers operate on `upcoming = queue.slice(activeVideoIndex)` — the
// CURRENT song is included so its singer's next song counts as round 1 (A on
// stage must not also own the next slot), but it can never move: it is the
// first round-0 entry, so the stable sort keeps it at index 0, and
// fairInsertIndex can only return 0 for an empty list. History
// (queue.slice(0, activeVideoIndex)) never participates — past turns are done.

function roundsOf(upcoming: QueueEntry[]): number[] {
  const counts = new Map<string, number>();
  return upcoming.map((e) => {
    const name = e.userName.trim();
    const round = counts.get(name) ?? 0;
    counts.set(name, round + 1);
    return round;
  });
}

/** Round-robin re-sort of the upcoming list. The sort is stable, which
 * preserves arrival order within a round — among each singer's "nth songs",
 * whoever queued first stays first. */
export function fairOrder(upcoming: QueueEntry[]): QueueEntry[] {
  const rounds = roundsOf(upcoming);
  return upcoming
    .map((entry, i) => ({ entry, round: rounds[i] }))
    .sort((a, b) => a.round - b.round)
    .map((x) => x.entry);
}

/** Where a NEW song by `userName` slots into `upcoming`: the new song is
 * round k (k = how many songs they already have upcoming), and it goes at the
 * index of the first entry whose round exceeds k — i.e. to the END of its
 * round, behind same-round entries that were queued earlier. */
export function fairInsertIndex(upcoming: QueueEntry[], userName: string): number {
  const name = userName.trim();
  const k = upcoming.filter((e) => e.userName.trim() === name).length;
  const rounds = roundsOf(upcoming);
  for (let i = 0; i < upcoming.length; i++) {
    if (rounds[i] > k) return i;
  }
  return upcoming.length;
}
