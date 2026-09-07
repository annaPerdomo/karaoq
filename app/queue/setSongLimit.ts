/** Set (or, with null, clear) the room's per-song time limit. */
export default async function setSongLimit(
  roomId: string,
  seconds: number | null
): Promise<boolean> {
  const params = new URLSearchParams({
    seconds: seconds === null ? "clear" : String(seconds),
  });
  try {
    const resp = await fetch(`/api/queue/${roomId}/song-limit?${params}`, {
      method: "POST",
    });
    return resp.ok;
  } catch {
    return false;
  }
}
