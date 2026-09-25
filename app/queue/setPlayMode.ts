import { PlayMode } from "../../pages/api/types";
import { notifyRoomKeyRejected, roomKeyHeaders } from "../../lib/roomKeyStore";

export default async function setPlayMode(
  roomId: string,
  playMode: PlayMode
): Promise<boolean> {
  const params = new URLSearchParams({ playMode });
  try {
    const resp = await fetch(`/api/queue/${roomId}/mode?${params}`, {
      method: "POST",
      headers: roomKeyHeaders(roomId),
    });
    if (resp.status === 403) notifyRoomKeyRejected(roomId);
    return resp.ok;
  } catch {
    return false;
  }
}
