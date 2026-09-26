import type { Room } from "../pages/api/types";

// A room nobody has written to for this long, with nothing playing, is almost
// always a party that ended with a TV or laptop tab still open. Those tabs poll
// forever, so they slow down; the first write anywhere in the room wakes them.
export const DORMANT_AFTER_MS = 2 * 60 * 60 * 1000;
export const DORMANT_POLL_MS = 20_000;

export function isRoomDormant(room: Pick<Room, "isPlaying" | "lastActivity" | "serverNow">): boolean {
  if (room.isPlaying || !room.lastActivity || typeof room.serverNow !== "number") return false;
  const last = new Date(room.lastActivity).getTime();
  return Number.isFinite(last) && room.serverNow - last > DORMANT_AFTER_MS;
}
