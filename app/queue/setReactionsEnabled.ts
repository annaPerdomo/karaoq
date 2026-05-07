export default async function setReactionsEnabled(
  roomId: string,
  enabled: boolean
): Promise<boolean> {
  const params = new URLSearchParams({ enabled: String(enabled) });
  const resp = await fetch(`/api/queue/${roomId}/reactions-toggle?${params}`, {
    method: "POST",
  });
  return resp.ok;
}
