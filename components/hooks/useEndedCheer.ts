import * as React from "react";
import { CHEER_WINDOW_MS } from "../host/stageTiming";

/** Room.endedEntryId persists through a wait of any length, so only a marker this
 * page saw arrive in the last CHEER_WINDOW_MS is cheered — never on a later remount. */
export function useEndedCheer(endedEntryId: string | null): {
  cheerEntryId: string | null;
  /** The page-load marker, never cheered; undefined until Host.applyRoomState seeds it. */
  preEndedRef: React.MutableRefObject<string | null | undefined>;
} {
  const preEndedRef = React.useRef<string | null | undefined>(undefined);
  const [expiredId, setExpiredId] = React.useState<string | null>(null);
  // Derived in render, not in an effect: a commit late, Up Next paints first.
  const pre = preEndedRef.current;
  const cheerEntryId =
    pre !== undefined &&
    endedEntryId !== null &&
    endedEntryId !== pre &&
    endedEntryId !== expiredId
      ? endedEntryId
      : null;
  React.useEffect(() => {
    // Clearing the sentinel before the first load would cheer the page-load marker.
    if (preEndedRef.current === undefined) return;
    if (endedEntryId !== preEndedRef.current) preEndedRef.current = null;
    if (endedEntryId === null || endedEntryId === preEndedRef.current) return;
    const timer = setTimeout(() => setExpiredId(endedEntryId), CHEER_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [endedEntryId]);
  return { cheerEntryId, preEndedRef };
}
