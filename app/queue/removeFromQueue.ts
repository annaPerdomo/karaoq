import { notifyRoomKeyRejected, roomKeyHeaders } from "../../lib/roomKeyStore";

export default async function removeFromQueue(
  roomId: string,
  entryId: string
): Promise<boolean> {
  const params = new URLSearchParams({ entryId });
  try {
    const resp = await fetch(`/api/queue/${roomId}/remove?${params}`, {
      method: "POST",
      headers: roomKeyHeaders(roomId),
    });
    if (resp.status === 403) notifyRoomKeyRejected(roomId);
    return resp.ok;
  } catch {
    return false;
  }
}
