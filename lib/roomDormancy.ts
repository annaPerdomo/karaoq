import type { Room } from "../pages/api/types";

// Quiet this long with nothing playing is almost always an ended party with a tab left open.
export const DORMANT_AFTER_MS = 2 * 60 * 60 * 1000;
export const DORMANT_POLL_MS = 20_000;

export function isRoomDormant(room: Pick<Room, "isPlaying" | "lastActivity" | "serverNow">): boolean {
  if (room.isPlaying || !room.lastActivity || typeof room.serverNow !== "number") return false;
  const last = new Date(room.lastActivity).getTime();
  return Number.isFinite(last) && room.serverNow - last > DORMANT_AFTER_MS;
}
