import { getRoomsCollection } from "./mongodb";

/** How far back "someone is using KaraoQ right now" reaches. Longer than a song
 *  so a room between numbers still reads as live, short enough that a party
 *  that ended an hour ago stops holding the corpus back. */
export const LIVE_ROOM_WINDOW_MS = 45 * 60_000;

/**
 * Rooms touched inside the window. `lastActivity` is the right signal because
 * every mutating route bumps it and the poll deliberately does not
 * (pages/api/queue/[id]) — so this counts rooms where somebody is *doing*
 * something, not tabs left open on a dead room. The TTL index on the field
 * serves the range read.
 *
 * Never throws: a database blip must not decide the cron's behaviour by
 * accident, so it reports "busy" and the run defers to the next slot.
 */
export async function liveRoomCount(
  now: number,
  windowMs: number = LIVE_ROOM_WINDOW_MS
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
