export type PairingPoll =
  | { status: "waiting" }
  | { status: "expired" }
  | { status: "claimed"; roomId: string }
  | { status: "error" };

export async function pollPairing(code: string, secret: string): Promise<PairingPoll> {
  try {
    const resp = await fetch(`/api/tv-pair/${code}`, {
      headers: { "x-pair-secret": secret },
    });
    if (resp.status === 404) return { status: "expired" };
    if (!resp.ok) return { status: "error" };
    const data = (await resp.json()) as { status?: unknown; roomId?: unknown };
    if (data.status === "waiting") return { status: "waiting" };
    if (data.status === "expired") return { status: "expired" };
    if (data.status === "claimed" && typeof data.roomId === "string") {
      return { status: "claimed", roomId: data.roomId };
    }
    return { status: "error" };
  } catch {
    return { status: "error" };
  }
}
