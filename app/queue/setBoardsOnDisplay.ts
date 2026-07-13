export default async function setBoardsOnDisplay(
  roomId: string,
  enabled: boolean
): Promise<boolean> {
  const params = new URLSearchParams({ enabled: String(enabled) });
  try {
    const resp = await fetch(`/api/queue/${roomId}/boards-toggle?${params}`, {
      method: "POST",
    });
    return resp.ok;
  } catch {
    return false;
  }
}
