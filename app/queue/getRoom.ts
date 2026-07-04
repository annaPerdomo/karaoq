import { Room } from "../../pages/api/types";

export default async function getRoom(
  roomId: string,
  // Display pages identify themselves: a read from a display proves a display
  // exists, so the server must never orphan-heal (stop) playback on it.
  opts?: { display?: boolean }
): Promise<Room | null> {
  const suffix = opts?.display ? "?display=1" : "";
  const resp = await fetch(`/api/queue/${roomId}${suffix}`, { cache: "no-store" });
  if (!resp.ok) return null;
  return resp.json();
}
