import { HostConfig } from "../../pages/api/types";
import { notifyRoomKeyRejected, roomKeyHeaders } from "../../lib/roomKeyStore";

export default async function setHostConfig(
  roomId: string,
  config: HostConfig
): Promise<boolean> {
  try {
    const resp = await fetch(`/api/queue/${roomId}/host-config`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...roomKeyHeaders(roomId) },
      body: JSON.stringify(config),
    });
    if (resp.status === 403) notifyRoomKeyRejected(roomId);
    return resp.ok;
  } catch {
    return false;
  }
}
