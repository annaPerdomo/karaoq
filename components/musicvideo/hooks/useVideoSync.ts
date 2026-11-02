import * as React from "react";
import { onPlayhead, PlayheadMessage } from "../../../app/queue/roomChannel";
import { serverNow } from "../../../lib/clockSkew";
import {
  canSeek,
  desiredPlaying,
  originalEnded,
  playCommand,
  PlayCommand,
  serverPlayhead,
  syncAction,
  targetSeconds,
  SEEK_COOLDOWN_MS,
} from "../../../lib/musicVideoSync";
import { ytCommand } from "../../player/ytCommand";

const SYNC_TICK_MS = 1000;
// Must stay below SEEK_COOLDOWN_MS so a player stuck paused still gets a play between re-seeks.
const SEEK_SETTLE_MS = 2500;

/**
 * Drives the muted player toward the karaoke video's position, and decides
 * when the original has run out before the karaoke track does. All playback
 * state (currentTime, playerState, duration) lives in refs fed by `onInfo` —
 * the tick loop reads them, it never waits on a render.
 */
export function useVideoSync({
  roomId,
  entryId,
  videoRef,
  isPlaying,
  displayPaused,
  playStartedAt,
  playPausedAt,
  offsetS,
}: {
  roomId: string | undefined;
  entryId: string | null;
  videoRef: React.RefObject<HTMLIFrameElement>;
  isPlaying: boolean;
  displayPaused: boolean;
  playStartedAt: string | null;
  playPausedAt: string | null;
  offsetS: number;
}): {
  ended: boolean;
  onInfo: (currentTime: number | null, state: number | undefined, duration: number | null) => void;
} {
  const currentTimeRef = React.useRef<number | null>(null);
  const stateRef = React.useRef<number | undefined>(undefined);
  const durationRef = React.useRef<number | null>(null);
  const playheadRef = React.useRef<PlayheadMessage | null>(null);
  const seekCooldownUntilRef = React.useRef(0);
  const lastCommandRef = React.useRef<PlayCommand | null>(null);
  const lastDesiredRef = React.useRef<boolean | null>(null);
  const settleUntilRef = React.useRef(0);
  const endedRef = React.useRef(false);
  const [ended, setEnded] = React.useState(false);
  React.useEffect(() => {
    endedRef.current = ended;
  }, [ended]);

  // A new song, or a play/pause toggle, invalidates whatever the last song's
  // tail looked like.
  React.useEffect(() => {
    currentTimeRef.current = null;
    stateRef.current = undefined;
    durationRef.current = null;
    lastCommandRef.current = null;
    setEnded(false);
  }, [entryId]);
  React.useEffect(() => {
    setEnded(false);
  }, [isPlaying]);

  React.useEffect(() => {
    if (!roomId) return;
    return onPlayhead(roomId, (msg) => {
      playheadRef.current = msg;
    });
  }, [roomId]);

  React.useEffect(() => {
    if (!entryId) return;
    const activeEntryId = entryId;
    function tick() {
      const now = serverNow();
      const server = serverPlayhead({ isPlaying, playStartedAt, playPausedAt }, now);
      const target = targetSeconds(server, playheadRef.current, activeEntryId, now, offsetS);

      const over = originalEnded(target, durationRef.current);
      if (over !== null && over !== endedRef.current) {
        setEnded(over);
        endedRef.current = over;
        // The screen swaps the player for the poster and back; a fresh iframe
        // starts from zero, so its last-known position and state are void.
        currentTimeRef.current = null;
        stateRef.current = undefined;
        lastCommandRef.current = null;
      }
      // Seeking a player past its end makes YouTube restart from zero, and
      // playVideo does the same, so an ended original gets no commands.
      if (endedRef.current) return;

      const playing = desiredPlaying(isPlaying && !displayPaused, playheadRef.current, activeEntryId, now);
      if (canSeek(stateRef.current, seekCooldownUntilRef.current, Date.now())) {
        const action = syncAction(currentTimeRef.current, target, playing);
        if (action.seekTo !== undefined) {
          ytCommand(videoRef.current, "seekTo", [action.seekTo, true]);
          currentTimeRef.current = null;
          seekCooldownUntilRef.current = Date.now() + SEEK_COOLDOWN_MS;
          settleUntilRef.current = Date.now() + SEEK_SETTLE_MS;
        }
      }
      // A seek reports a transient pause while it lands, and answering it with
      // playVideo flashes YouTube's play/pause glyph; mid-seek only a real toggle gets a command.
      const settling = Date.now() < settleUntilRef.current && playing === lastDesiredRef.current;
      lastDesiredRef.current = playing;
      const command = settling ? null : playCommand(stateRef.current, playing, lastCommandRef.current);
      if (command) {
        ytCommand(videoRef.current, command);
        lastCommandRef.current = command;
      }
    }
    tick();
    const interval = setInterval(tick, SYNC_TICK_MS);
    return () => clearInterval(interval);
  }, [entryId, isPlaying, displayPaused, playStartedAt, playPausedAt, offsetS, roomId, videoRef]);

  const onInfo = React.useCallback(
    (currentTime: number | null, state: number | undefined, duration: number | null) => {
      if (currentTime !== null) currentTimeRef.current = currentTime;
      if (state !== undefined) stateRef.current = state;
      if (duration !== null) durationRef.current = duration;
    },
    []
  );

  return { ended, onInfo };
}
