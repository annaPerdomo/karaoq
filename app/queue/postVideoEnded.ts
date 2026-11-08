import type { PlaySurface, SongEndReason } from "../../lib/analytics";

export default async function postVideoEnded(
  roomId: string,
  endedIndex: number,
  how?: SongEndReason,
  surface?: PlaySurface
): Promise<boolean> {
  const params = new URLSearchParams({ index: String(endedIndex) });
  if (how) params.set("reason", how);
  if (surface) params.set("surface", surface);
  try {
    const resp = await fetch(`/api/queue/${roomId}/video-ended?${params}`, {
      method: "POST",
    });
    if (!resp.ok) return false;
    // The route answers 200 with `advanced: false` when its guard matched
    // nothing: a no-op, not a success. `ok` alone would report a phantom advance.
    const body = (await resp.json()) as { advanced?: unknown };
    return body?.advanced === true;
  } catch {
    return false;
  }
}
