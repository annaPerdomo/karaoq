export default async function renameQueueEntry(
  roomId: string,
  entryId: string,
  userName: string
): Promise<boolean> {
  const params = new URLSearchParams({ entryId, userName });
  try {
    const resp = await fetch(`/api/queue/${roomId}/rename?${params}`, {
      method: "POST",
    });
    return resp.ok;
  } catch {
    return false;
  }
}
