import * as React from "react";
import { broadcastPlayhead } from "../../../app/queue/roomChannel";
import { serverNow } from "../../../lib/clockSkew";
import { throttled } from "../../player/ytCommand";

const PLAYHEAD_THROTTLE_MS = 1000;
const PLAYHEAD_REPEAT_MS = 1000;

/**
 * Throttled playhead broadcast. Tracks the last known playerState itself —
 * broadcasting a message's own state would read "stopped" on anything that
 * doesn't carry one (onError, onReady). The last position repeats while paused:
 * a paused player stops reporting currentTime, and a quiet pause would read as
 * stale and resume.
 */
export function usePlayheadBroadcast(
  roomId: string | undefined,
  entryId: string | undefined
): (currentTime: number | null, state: number | undefined) => void {
  const throttleRef = React.useRef({ last: 0 });
  const lastStateRef = React.useRef<number | undefined>(undefined);
  const lastTimeRef = React.useRef<number | null>(null);

  // A new song's first infoDelivery hasn't landed yet — the previous song's
  // state must not leak into its broadcast.
  React.useEffect(() => {
    lastStateRef.current = undefined;
    lastTimeRef.current = null;
  }, [entryId]);

  const send = React.useCallback(() => {
    if (!roomId || !entryId || lastTimeRef.current === null) return;
    const playerState = lastStateRef.current;
    broadcastPlayhead(roomId, {
      entryId,
      seconds: lastTimeRef.current,
      playing: playerState === 1 || playerState === 3,
      sentAt: serverNow(),
    });
  }, [roomId, entryId]);

  React.useEffect(() => {
    if (!roomId || !entryId) return;
    const id = setInterval(() => {
      if (lastStateRef.current !== 1 && lastStateRef.current !== 3) send();
    }, PLAYHEAD_REPEAT_MS);
    return () => clearInterval(id);
  }, [roomId, entryId, send]);

  return React.useCallback(
    (currentTime: number | null, state: number | undefined) => {
      const changed = state !== undefined && state !== lastStateRef.current;
      if (state !== undefined) lastStateRef.current = state;
      if (currentTime !== null) lastTimeRef.current = currentTime;
      if (changed) {
        throttleRef.current.last = Date.now();
        send();
        return;
      }
      if (currentTime === null) return;
      if (!throttled(throttleRef.current, Date.now(), PLAYHEAD_THROTTLE_MS)) return;
      send();
    },
    [send]
  );
}
