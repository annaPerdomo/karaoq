import * as React from "react";
import { autoStartFor } from "../../lib/externalEntry";
import type { QueueEntry } from "../../pages/api/types";

/** autoStartAt as the entry on stage may use it. The stamp an external entry
 *  sat on stays hidden once that entry is gone, or the next song would start
 *  the instant the swap lands. A different stamp is a fresh one and passes. */
export function useEntryAutoStartStamp(
  entry: Pick<QueueEntry, "external"> | null | undefined,
  autoStartAt: number | null
): number | null {
  const heldStampRef = React.useRef<number | null | undefined>(undefined);
  if (entry?.external === true) {
    heldStampRef.current = autoStartAt;
    return null;
  }
  if (heldStampRef.current !== undefined) {
    if (autoStartAt !== null && autoStartAt === heldStampRef.current) return null;
    heldStampRef.current = undefined;
  }
  return autoStartFor(entry, autoStartAt);
}
