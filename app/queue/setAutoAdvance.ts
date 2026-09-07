import { AutoAdvance } from "../../pages/api/types";

/** Patch the room's auto-advance setting; unspecified fields keep their value. */
export default async function setAutoAdvance(
  roomId: string,
  patch: Partial<AutoAdvance>
): Promise<boolean> {
  try {
    const resp = await fetch(`/api/queue/${roomId}/auto-advance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    return resp.ok;
  } catch {
    return false;
  }
}
