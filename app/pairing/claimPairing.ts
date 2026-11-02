export type ClaimResult =
  | { ok: true; roomId: string }
  | { ok: false; reason: "needs-room" | "expired" | "rate-limited" | "error" };

export async function claimPairing(code: string, roomId?: string): Promise<ClaimResult> {
  try {
    const resp = await fetch(`/api/tv-pair/${code}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(roomId ? { roomId } : {}),
    });
    if (resp.status === 409) return { ok: false, reason: "needs-room" };
    if (resp.status === 410) return { ok: false, reason: "expired" };
    if (resp.status === 429) return { ok: false, reason: "rate-limited" };
    if (!resp.ok) return { ok: false, reason: "error" };

    const data = (await resp.json()) as { roomId?: unknown };
    if (typeof data.roomId !== "string") return { ok: false, reason: "error" };
    return { ok: true, roomId: data.roomId };
  } catch {
    return { ok: false, reason: "error" };
  }
}
