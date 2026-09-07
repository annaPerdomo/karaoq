import * as React from "react";
import { serverNow } from "../../lib/clockSkew";

const TICK_MS = 250;

/** Every surface runs this and shows the same seconds, because all measure one
 * server-stamped instant against the server's clock (lib/clockSkew). Only a
 * surface passing `canStart` fires the start, once per stamp. `onStart` may
 * return false to decline; the stamp stays live and a later visible tick fires it. */
export function useAutoStart({
  autoStartAt,
  isPlaying,
  canStart,
  onStart,
}: {
  /** Room.autoStartAt as epoch ms, null when no countdown is pending. */
  autoStartAt: number | null;
  isPlaying: boolean;
  canStart: boolean;
  onStart: () => void | boolean;
}): { secondsLeft: number | null } {
  const [secondsLeft, setSecondsLeft] = React.useState<number | null>(null);
  const firedForRef = React.useRef<number | null>(null);
  const onStartRef = React.useRef(onStart);
  onStartRef.current = onStart;
  const canStartRef = React.useRef(canStart);
  canStartRef.current = canStart;
  // A stamp that lapsed before this surface mounted ran while nobody was here (a
  // display reopened after the gap); firing it blasts a song with no countdown
  // shown. One a gap change re-times into the past still fires.
  const mountedAtRef = React.useRef(serverNow());

  const armed = autoStartAt !== null && !isPlaying;

  React.useEffect(() => {
    if (!armed || autoStartAt === null) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => {
      const remainingMs = autoStartAt - serverNow();
      setSecondsLeft(Math.max(0, Math.ceil(remainingMs / 1000)));
      if (remainingMs > 0) return;
      if (firedForRef.current === autoStartAt) return;
      if (autoStartAt < mountedAtRef.current) {
        firedForRef.current = autoStartAt;
        return;
      }
      if (!canStartRef.current) return;
      if (onStartRef.current() === false) return;
      firedForRef.current = autoStartAt;
    };
    tick();
    // A hidden tab throttles this to ~1/s, still within a second of the stamp.
    const interval = setInterval(tick, TICK_MS);
    return () => clearInterval(interval);
  }, [armed, autoStartAt]);

  return { secondsLeft: armed ? secondsLeft : null };
}
