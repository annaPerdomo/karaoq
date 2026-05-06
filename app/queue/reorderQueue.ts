import { QueueEntry } from "../../pages/api/types";

export default async function reorderQueue(
  roomId: string,
  queue: QueueEntry[],
  activeVideoIndex: number
): Promise<boolean> {
  const resp = await fetch(`/api/queue/${roomId}/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ queue, activeVideoIndex }),
  });
  return resp.ok;
}
