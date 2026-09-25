import { roomKeyHeaders } from "../../lib/roomKeyStore";

/** Mints a co-host key for the room; the host key must already be stored for
 * this device. Resolves to the plaintext key, or null on failure. */
export default async function mintCohostKey(roomId: string): Promise<string | null> {
  try {
    const resp = await fetch(`/api/queue/${roomId}/keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...roomKeyHeaders(roomId) },
      body: JSON.stringify({ role: "cohost" }),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { roomKey?: unknown };
    return typeof data.roomKey === "string" ? data.roomKey : null;
  } catch {
    return null;
  }
}
