import { roomKeyHeaders } from "../../lib/roomKeyStore";

export interface CreatedPairing {
  code: string;
  secret: string;
  expiresAt: number;
}

export async function createPairing(
  kind: "screen" | "remote",
  roomId?: string
): Promise<CreatedPairing | null> {
  try {
    const resp = await fetch("/api/tv-pair", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(roomId ? roomKeyHeaders(roomId) : {}),
      },
      body: JSON.stringify(kind === "remote" ? { kind, roomId } : { kind }),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as Partial<CreatedPairing>;
    if (
      typeof data.code !== "string" ||
      typeof data.secret !== "string" ||
      typeof data.expiresAt !== "number"
    ) {
      return null;
    }
    return { code: data.code, secret: data.secret, expiresAt: data.expiresAt };
  } catch {
    return null;
  }
}
