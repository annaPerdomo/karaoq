/** Set (or, with null, clear) the wall-clock time the room has to be out by. */
export default async function setSessionEnd(
  roomId: string,
  endsAt: number | null
): Promise<boolean> {
  const params = new URLSearchParams({
    at: endsAt === null ? "clear" : String(endsAt),
  });
  try {
    const resp = await fetch(`/api/queue/${roomId}/session-end?${params}`, {
      method: "POST",
    });
    return resp.ok;
  } catch {
    return false;
  }
}
