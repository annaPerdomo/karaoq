import { notifyRoomKeyRejected, roomKeyHeaders } from "../../lib/roomKeyStore";

export default async function cancelAutoStart(roomId: string): Promise<boolean> {
  try {
    const resp = await fetch(`/api/queue/${roomId}/auto-advance?cancel=1`, {
      method: "POST",
      headers: roomKeyHeaders(roomId),
    });
    if (resp.status === 403) notifyRoomKeyRejected(roomId);
    return resp.ok;
  } catch {
    return false;
  }
}
