import { QueueEntry } from "../../pages/api/types";
import { notifyRoomKeyRejected, roomKeyHeaders } from "../../lib/roomKeyStore";

export default async function reorderQueue(
  roomId: string,
  queue: QueueEntry[],
  activeVideoIndex: number
): Promise<boolean> {
  try {
    const resp = await fetch(`/api/queue/${roomId}/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...roomKeyHeaders(roomId) },
      body: JSON.stringify({ queue, activeVideoIndex }),
    });
    if (resp.status === 403) notifyRoomKeyRejected(roomId);
    return resp.ok;
  } catch {
    return false;
  }
}
