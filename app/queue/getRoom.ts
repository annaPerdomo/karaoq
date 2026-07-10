import { Room } from "../../pages/api/types";

// "notFound" is definitive (the server said 404); "error" is transient
// (network drop, 5xx, 429). Callers must treat them differently — rendering
// "room doesn't exist" for a wifi blip strands the user, and clearing stored
// room pointers on a blip destroys legitimate state.
export type GetRoomResult = Room | "notFound" | "error";

export function isRoom(result: GetRoomResult): result is Room {
  return typeof result !== "string";
}

export default async function getRoom(
  roomId: string,
  // Display pages identify themselves: a read from a display proves a display
  // exists, so the server must never orphan-heal (stop) playback on it.
  opts?: { display?: boolean }
): Promise<GetRoomResult> {
  const suffix = opts?.display ? "?display=1" : "";
  try {
    const resp = await fetch(`/api/queue/${roomId}${suffix}`, { cache: "no-store" });
    if (resp.status === 404) return "notFound";
    if (!resp.ok) return "error";
    return await resp.json();
  } catch {
    return "error";
  }
}
