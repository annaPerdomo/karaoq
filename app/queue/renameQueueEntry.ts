import { notifyRoomKeyRejected, roomKeyHeaders } from "../../lib/roomKeyStore";

export default async function renameQueueEntry(
  roomId: string,
  entryId: string,
  userName: string
): Promise<boolean> {
  const params = new URLSearchParams({ entryId, userName });
  try {
    const resp = await fetch(`/api/queue/${roomId}/rename?${params}`, {
      method: "POST",
      headers: roomKeyHeaders(roomId),
    });
    if (resp.status === 403) notifyRoomKeyRejected(roomId);
    return resp.ok;
  } catch {
    return false;
  }
}
