import { singerKeys } from "../../lib/fairQueue";
import { QueueEntry } from "../../pages/api/types";

export { default as formatSongTitle } from "../../lib/songTitle";

export function isTextReaction(emoji: string): boolean {
  return emoji.length > 2 && /[a-zA-Z]/.test(emoji);
}

export function includesCurrentInSidebar(hasCurrent: boolean, isPlaying: boolean): boolean {
  return !!(hasCurrent && !isPlaying);
}

/** Counted the way the rotation groups people — a duet entry counts each member. */
export function uniqueSingerCount(entries: QueueEntry[]): number {
  return new Set(entries.flatMap((s) => singerKeys(s.userName))).size;
}

/**
 * Whether this host page should adopt a playing room that no screen has claimed
 * — a co-host's Play, which sets isPlaying but mints no playToken. Every "no"
 * here is load-bearing; see the claim effect in Host.tsx for why each one is.
 * The winner is still decided server-side, by CAS on the token being free.
 */
export function shouldClaimPlayback({
  remote,
  tvMode,
  adminPeek,
  isPlaying,
  serverPlayToken,
  hasCurrentSong,
  visible,
}: {
  remote: boolean;
  tvMode: boolean;
  adminPeek: boolean;
  isPlaying: boolean;
  serverPlayToken: string | null;
  hasCurrentSong: boolean;
  visible: boolean;
}): boolean {
  if (remote || tvMode || adminPeek) return false;
  if (!isPlaying || serverPlayToken) return false;
  if (!hasCurrentSong) return false;
  return visible;
}
