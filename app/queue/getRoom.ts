import { Room } from "../../pages/api/types";
import { recordServerTime } from "../../lib/clockSkew";

// "notFound" is definitive (the server said 404); "error" is transient
// (network drop, 5xx, 429). Callers must treat them differently — rendering
// "room doesn't exist" for a wifi blip strands the user, and clearing stored
// room pointers on a blip destroys legitimate state.
export type GetRoomResult = Room | "notFound" | "error";

export function isRoom(result: GetRoomResult): result is Room {
  return typeof result !== "string";
}

const ROOM_READ_TIMEOUT_MS = 10_000;

export default async function getRoom(
  roomId: string,
  // Display pages identify themselves: a read from a display proves a display
  // exists, so the server must never orphan-heal (stop) playback on it.
  opts?: { display?: boolean; wake?: boolean }
): Promise<GetRoomResult> {
  const params = new URLSearchParams();
  if (opts?.display) params.set("display", "1");
  if (opts?.wake) params.set("wake", "1");
  const query = params.toString();
  const suffix = query ? `?${query}` : "";
  // A hung read blocks the poller, and a display's poll is its heartbeat.
  // AbortController, not AbortSignal.timeout: older smart-TV browsers lack it.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ROOM_READ_TIMEOUT_MS);
  try {
    const resp = await fetch(`/api/queue/${roomId}${suffix}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (resp.status === 404) return "notFound";
    if (!resp.ok) return "error";
    const room = await resp.json();
    recordServerTime(room?.serverNow);
    return room;
  } catch {
    return "error";
  } finally {
    clearTimeout(timeout);
  }
}
