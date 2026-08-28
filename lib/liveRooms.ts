import { CORPUS_BUSY_WINDOW_MS } from "./liveWindows";
import { getRoomsCollection } from "./mongodb";

/**
 * Rooms touched inside the window; the TTL index on the field serves the range
 * read. Never throws: a database blip must not decide the cron's behaviour by
 * accident, so it reports "busy" and the run defers to the next slot.
 */
export async function liveRoomCount(
  now: number,
  windowMs: number = CORPUS_BUSY_WINDOW_MS
): Promise<number> {
  try {
    const rooms = await getRoomsCollection();
    return await rooms.countDocuments({
      lastActivity: { $gte: new Date(now - windowMs) },
    });
  } catch (e: any) {
    console.warn("Live room count failed, assuming busy:", e?.message);
    return 1;
  }
}
