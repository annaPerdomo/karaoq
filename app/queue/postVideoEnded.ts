export default async function postVideoEnded(
  roomId: string,
  endedIndex: number
): Promise<boolean> {
  const params = new URLSearchParams({ index: String(endedIndex) });
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
