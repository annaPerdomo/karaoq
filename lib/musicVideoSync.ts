import { PlayheadMessage } from "../app/queue/roomChannel";

/** Seconds of drift tolerated before the music-video screen seeks to catch up. */
export const DRIFT_SEEK_S = 1.5;
/** A playhead broadcast older than this is treated as stale, same as a different entry. */
export const PLAYHEAD_FRESH_MS = 3000;

/** The karaoke video's position as the server's own clock would report it —
 * paused freezes it at the pause instant; running counts up from playStartedAt. */
export function serverPlayhead(
  r: {
    isPlaying: boolean;
    playStartedAt?: string | Date | null;
    playPausedAt?: string | Date | null;
  },
  nowMs: number
): number | null {
  if (!r.isPlaying || !r.playStartedAt) return null;
  const startedMs = new Date(r.playStartedAt).getTime();
  if (!Number.isFinite(startedMs)) return null;
  if (r.playPausedAt) {
    const pausedMs = new Date(r.playPausedAt).getTime();
    if (!Number.isFinite(pausedMs)) return null;
    return Math.max(0, (pausedMs - startedMs) / 1000);
  }
  return Math.max(0, (nowMs - startedMs) / 1000);
}

/** Prefers a fresh same-browser playhead over the server estimate — it carries
 * the karaoke iframe's own position, which beats re-deriving it from
 * playStartedAt. Falls back to `server` when the playhead is stale, missing,
 * or for a different entry. */
export function targetSeconds(
  server: number | null,
  playhead: PlayheadMessage | null,
  entryId: string,
  nowMs: number,
  offsetS: number
): number | null {
  let base: number | null = server;
  if (playhead && freshFor(playhead, entryId, nowMs)) {
    const elapsed = playhead.playing ? (nowMs - playhead.sentAt) / 1000 : 0;
    base = playhead.seconds + elapsed;
  }
  if (base === null) return null;
  return Math.max(0, base + offsetS);
}

export function syncAction(
  currentS: number | null,
  targetS: number | null,
  playing: boolean
): { seekTo?: number; play: boolean } {
  if (targetS === null) return { play: playing };
  if (currentS === null || Math.abs(currentS - targetS) > DRIFT_SEEK_S) {
    return { seekTo: targetS, play: playing };
  }
  return { play: playing };
}

/** A seek takes a moment to land and reports buffering (state 3) while it
 * does — seeking again before then chases a player that hasn't caught up
 * yet. This cooldown, plus never seeking mid-buffer, is what stops that storm. */
export const SEEK_COOLDOWN_MS = 4000;

export function canSeek(
  state: number | undefined,
  cooldownUntilMs: number,
  nowMs: number
): boolean {
  return state !== 3 && nowMs >= cooldownUntilMs;
}

/** YouTube's own "ended" (state 0) also fires on a stale/paused player and on
 * scrubbing past the end transiently — only trust it once the sync target has
 * actually caught up to the original's known duration. */
export function originalEnded(
  target: number | null,
  duration: number | null,
  state: number | undefined
): boolean {
  return state === 0 && duration !== null && target !== null && target >= duration;
}

function freshFor(playhead: PlayheadMessage | null, entryId: string, nowMs: number): boolean {
  return !!playhead && playhead.entryId === entryId && nowMs - playhead.sentAt <= PLAYHEAD_FRESH_MS;
}

/** A "Playing here" host pauses only on its own device — the room never hears
 * about it — so a fresh same-browser playhead outranks the room's flags. */
export function desiredPlaying(
  roomPlaying: boolean,
  playhead: PlayheadMessage | null,
  entryId: string,
  nowMs: number
): boolean {
  return freshFor(playhead, entryId, nowMs) ? playhead!.playing : roomPlaying;
}

export type PlayCommand = "playVideo" | "pauseVideo";

/** YouTube animates its centre play/pause glyph on every command, so only send
 * one when the player isn't already where we want it. */
export function playCommand(
  state: number | undefined,
  playing: boolean,
  lastSent: PlayCommand | null
): PlayCommand | null {
  const want: PlayCommand = playing ? "playVideo" : "pauseVideo";
  if (state === undefined) return lastSent === want ? null : want;
  const running = state === 1 || state === 3;
  return running === playing ? null : want;
}
