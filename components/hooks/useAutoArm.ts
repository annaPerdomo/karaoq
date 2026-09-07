import * as React from "react";
import armAutoStart from "../../app/queue/armAutoStart";

/** Re-times a countdown that lapsed while no host page was open. The route
 * refuses a room told to hold (Stop/Cancel delete the stamp); `hold` spares
 * the page's own Stop or Cancel the round trip. */
export function useAutoArm({
  roomId,
  enabled,
  isPlaying,
  autoStartAt,
  activeIndex,
  hasCurrent,
  claimNonce,
  isPausedRef,
  setAutoStartAt,
}: {
  roomId: string | undefined;
  /** Auto-advance is on and this page is a here-mode host that may arm. */
  enabled: boolean;
  isPlaying: boolean;
  /** Room.autoStartAt as epoch ms, null when no countdown is pending. */
  autoStartAt: number | null;
  activeIndex: number;
  hasCurrent: boolean;
  /** Bumped when a tab that landed hidden is brought forward. */
  claimNonce: number;
  isPausedRef: React.MutableRefObject<boolean>;
  setAutoStartAt: (stamp: number) => void;
}): { hold: () => void } {
  // A debounce on the request, not a once-per-song latch: adopting a stamp
  // clears it so a countdown that lapses in a hidden tab is re-armed on return.
  const settledIndexRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (autoStartAt !== null) settledIndexRef.current = null;
  }, [autoStartAt]);

  React.useEffect(() => {
    if (!roomId || !enabled || isPlaying || autoStartAt !== null) return;
    if (!hasCurrent) return;
    if (settledIndexRef.current === activeIndex) return;
    if (document.visibilityState !== "visible") return;
    settledIndexRef.current = activeIndex;
    (async () => {
      const stamp = await armAutoStart(roomId);
      if (stamp === null || isPausedRef.current) return;
      setAutoStartAt(stamp);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, enabled, isPlaying, autoStartAt, activeIndex, hasCurrent, claimNonce]);

  const hold = React.useCallback(() => {
    settledIndexRef.current = activeIndex;
  }, [activeIndex]);

  return { hold };
}
