export default async function setFairMode(
  roomId: string,
  enabled: boolean
): Promise<boolean> {
  const params = new URLSearchParams({ enabled: String(enabled) });
  try {
    const resp = await fetch(`/api/queue/${roomId}/fair-mode?${params}`, {
      method: "POST",
    });
    return resp.ok;
  } catch {
    return false;
  }
}
