import { autoStartEpoch } from "../../lib/autoAdvance";

/** Resolves to the stamp as epoch ms; null when nothing was armed or the call failed. */
export default async function armAutoStart(roomId: string): Promise<number | null> {
  try {
    const resp = await fetch(`/api/queue/${roomId}/auto-advance?arm=1`, {
      method: "POST",
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { autoStartAt?: unknown };
    return autoStartEpoch(data.autoStartAt);
  } catch {
    return null;
  }
}
