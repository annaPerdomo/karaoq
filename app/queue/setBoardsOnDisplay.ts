import { notifyRoomKeyRejected, roomKeyHeaders } from "../../lib/roomKeyStore";

export default async function setBoardsOnDisplay(
  roomId: string,
  enabled: boolean
): Promise<boolean> {
  const params = new URLSearchParams({ enabled: String(enabled) });
  try {
    const resp = await fetch(`/api/queue/${roomId}/boards-toggle?${params}`, {
      method: "POST",
      headers: roomKeyHeaders(roomId),
    });
    if (resp.status === 403) notifyRoomKeyRejected(roomId);
    return resp.ok;
  } catch {
    return false;
  }
}
