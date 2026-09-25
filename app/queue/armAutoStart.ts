import { autoStartEpoch } from "../../lib/autoAdvance";
import { notifyRoomKeyRejected, roomKeyHeaders } from "../../lib/roomKeyStore";

/** Resolves to the stamp as epoch ms; null when nothing was armed or the call failed. */
export default async function armAutoStart(roomId: string): Promise<number | null> {
  try {
    const resp = await fetch(`/api/queue/${roomId}/auto-advance?arm=1`, {
      method: "POST",
      headers: roomKeyHeaders(roomId),
    });
    if (resp.status === 403) notifyRoomKeyRejected(roomId);
    if (!resp.ok) return null;
    const data = (await resp.json()) as { autoStartAt?: unknown };
    return autoStartEpoch(data.autoStartAt);
  } catch {
    return null;
  }
}
