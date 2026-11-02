import * as React from "react";
import { onOriginalOffset } from "../../../app/queue/roomChannel";

interface BroadcastOffset {
  entryId: string;
  offsetSeconds: number;
}

/** The polled nudge, overridden by a same-browser host's broadcast until a poll
 *  echoes it — so a later server change can't stay hidden behind a stale broadcast. */
export function useEntryOffset(
  roomId: string | undefined,
  entryId: string | null,
  polledOffsetSeconds: number
): number {
  const [broadcast, setBroadcast] = React.useState<BroadcastOffset | null>(null);

  React.useEffect(() => {
    setBroadcast(null);
  }, [entryId]);

  React.useEffect(() => {
    if (!roomId) return;
    return onOriginalOffset(roomId, setBroadcast);
  }, [roomId]);

  React.useEffect(() => {
    if (
      broadcast &&
      broadcast.entryId === entryId &&
      broadcast.offsetSeconds === polledOffsetSeconds
    ) {
      setBroadcast(null);
    }
  }, [broadcast, entryId, polledOffsetSeconds]);

  if (broadcast && broadcast.entryId === entryId) return broadcast.offsetSeconds;
  return polledOffsetSeconds;
}
