import { roomKeyHeaders, setRoomKey } from "../../lib/roomKeyStore";
import type { RoomKeyRole } from "../../lib/roomKeys";

const ROOM_KEY_ROLES: RoomKeyRole[] = ["host", "cohost", "display"];

export type ClaimResult =
  | { ok: true; kind: "screen"; roomId: string }
  | { ok: true; kind: "remote"; roomId: string }
  | { ok: false; reason: "needs-room" | "expired" | "rate-limited" | "error" };

export async function claimPairing(code: string, roomId?: string): Promise<ClaimResult> {
  try {
    const resp = await fetch(`/api/tv-pair/${code}/claim`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(roomId ? roomKeyHeaders(roomId) : {}),
      },
      body: JSON.stringify(roomId ? { roomId } : {}),
    });
    if (resp.status === 409) return { ok: false, reason: "needs-room" };
    if (resp.status === 410) return { ok: false, reason: "expired" };
    if (resp.status === 429) return { ok: false, reason: "rate-limited" };
    if (!resp.ok) return { ok: false, reason: "error" };

    const data = (await resp.json()) as {
      kind?: unknown;
      roomId?: unknown;
      roomKey?: unknown;
      roomKeyRole?: unknown;
    };
    if (typeof data.roomId !== "string") return { ok: false, reason: "error" };

    if (
      data.kind === "remote" &&
      typeof data.roomKey === "string" &&
      typeof data.roomKeyRole === "string" &&
      (ROOM_KEY_ROLES as string[]).includes(data.roomKeyRole)
    ) {
      setRoomKey(data.roomId, data.roomKey, data.roomKeyRole as RoomKeyRole);
      return { ok: true, kind: "remote", roomId: data.roomId };
    }
    if (data.kind === "screen") {
      return { ok: true, kind: "screen", roomId: data.roomId };
    }
    return { ok: false, reason: "error" };
  } catch {
    return { ok: false, reason: "error" };
  }
}
