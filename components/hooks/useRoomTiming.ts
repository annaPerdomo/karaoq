import * as React from "react";
import { QueueEntry, Room } from "../../pages/api/types";
import {
  QueueEstimate,
  estimateQueue,
  normalizeSessionEnd,
} from "../../lib/queueTime";
import { serverNow } from "../../lib/clockSkew";

/**
 * The room's clock: when the song on stage started, whether it's paused, when
 * the night has to end, and the running estimate built from all three. One hook
 * for the host, display and singer screens — a queue time that differs between
 * them is worse than no queue time at all.
 */
export interface RoomTiming {
  /** Wrap-up time for the room, null when it's open-ended. */
  sessionEndsAt: number | null;
  /** ISO stamp of when the song on stage started, mirrored from the room. */
  playStartedAt: string | null;
  estimate: QueueEstimate;
  /** Adopt the timing fields off a room read (initial load and every poll). */
  adoptRoom: (room: Room) => void;
  /** A wrap-up time this device just set, ahead of the poll confirming it. */
  setSessionEndsAt: (endsAt: number | null) => void;
  /**
   * A song just started here: mirrors the stamps the server wrote and returns
   * the start for broadcasting. Without it a stop-then-play on the same song
   * keeps the old start until the next poll, and the estimate reports a song
   * that's nearly over.
   */
  markStarted: () => string;
  /** Playback stopped, or moved off this song. */
  markStopped: () => void;
  /** Adopt a start stamp from another tab's broadcast, ahead of the poll. */
  adoptBroadcast: (startedAt: string | null, playing: boolean) => void;
}

export function useRoomTiming({
  queue,
  activeVideoIndex,
  isPlaying,
}: {
  queue: QueueEntry[];
  activeVideoIndex: number;
  isPlaying: boolean;
}): RoomTiming {
  const [sessionEndsAt, setSessionEndsAt] = React.useState<number | null>(null);
  const [playStartedAt, setPlayStartedAt] = React.useState<string | null>(null);
  const [playPausedAt, setPlayPausedAt] = React.useState<string | null>(null);

  const adoptRoom = React.useCallback((room: Room) => {
    setPlayStartedAt(
      room.playStartedAt ? new Date(room.playStartedAt).toISOString() : null
    );
    setPlayPausedAt(
      room.playPausedAt ? new Date(room.playPausedAt).toISOString() : null
    );
    setSessionEndsAt(normalizeSessionEnd(room.sessionEndsAt));
  }, []);

  const markStarted = React.useCallback(() => {
    const startedAt = new Date(serverNow()).toISOString();
    setPlayStartedAt(startedAt);
    setPlayPausedAt(null);
    return startedAt;
  }, []);

  const markStopped = React.useCallback(() => {
    setPlayStartedAt(null);
    setPlayPausedAt(null);
  }, []);

  const adoptBroadcast = React.useCallback(
    (startedAt: string | null, playing: boolean) => {
      setPlayStartedAt(startedAt);
      // A paused clock can't survive a play.
      if (playing) setPlayPausedAt(null);
    },
    []
  );

  // Recomputed on every render rather than memoized: each poll lands a fresh
  // queue array anyway, and that tick is what keeps the countdown moving.
  const estimate = estimateQueue({
    queue,
    activeVideoIndex,
    isPlaying,
    playStartedAt,
    playPausedAt,
    now: serverNow(),
  });

  return {
    sessionEndsAt,
    playStartedAt,
    estimate,
    adoptRoom,
    setSessionEndsAt,
    markStarted,
    markStopped,
    adoptBroadcast,
  };
}
