import { AutoAdvance } from "../../pages/api/types";
import { notifyRoomKeyRejected, roomKeyHeaders } from "../../lib/roomKeyStore";

/** Patch the room's auto-advance setting; unspecified fields keep their value. */
export default async function setAutoAdvance(
  roomId: string,
  patch: Partial<AutoAdvance>
): Promise<boolean> {
  try {
    const resp = await fetch(`/api/queue/${roomId}/auto-advance`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...roomKeyHeaders(roomId) },
      body: JSON.stringify(patch),
    });
    if (resp.status === 403) notifyRoomKeyRejected(roomId);
    return resp.ok;
  } catch {
    return false;
  }
}
