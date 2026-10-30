import * as React from "react";
import { broadcastPlayhead } from "../../../app/queue/roomChannel";
import { serverNow } from "../../../lib/clockSkew";
import { throttled } from "../../player/ytCommand";

const PLAYHEAD_THROTTLE_MS = 1000;

/**
 * Throttled playhead broadcast. Tracks the last known playerState itself —
 * broadcasting a message's own state would read "stopped" on anything that
 * doesn't carry one (onError, onReady) — and only fires when currentTime did.
 */
export function usePlayheadBroadcast(
  roomId: string | undefined,
  entryId: string | undefined
): (currentTime: number | null, state: number | undefined) => void {
  const throttleRef = React.useRef({ last: 0 });
  const lastStateRef = React.useRef<number | undefined>(undefined);

  // A new song's first infoDelivery hasn't landed yet — the previous song's
  // state must not leak into its broadcast.
  React.useEffect(() => {
    lastStateRef.current = undefined;
  }, [entryId]);

  return React.useCallback(
    (currentTime: number | null, state: number | undefined) => {
      if (state !== undefined) lastStateRef.current = state;
      if (!roomId || !entryId || currentTime === null) return;
      if (!throttled(throttleRef.current, Date.now(), PLAYHEAD_THROTTLE_MS)) return;
      const playerState = lastStateRef.current;
      broadcastPlayhead(roomId, {
        entryId,
        seconds: currentTime,
        playing: playerState === 1 || playerState === 3,
        sentAt: serverNow(),
      });
    },
    [roomId, entryId]
  );
}
