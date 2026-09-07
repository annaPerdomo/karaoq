/** Push a queued song back: past the next `after` songs, or to the end. */
export default async function postponeEntry(
  roomId: string,
  entryId: string,
  after: number | "end"
): Promise<boolean> {
  const params = new URLSearchParams({ entryId, after: String(after) });
  try {
    const resp = await fetch(`/api/queue/${roomId}/postpone?${params}`, {
      method: "POST",
    });
    return resp.ok;
  } catch {
    return false;
  }
}
