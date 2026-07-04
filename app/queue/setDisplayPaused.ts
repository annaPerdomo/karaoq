export default async function setDisplayPaused(
  roomId: string,
  paused: boolean
): Promise<boolean> {
  const params = new URLSearchParams({ paused: String(paused) });
  const resp = await fetch(`/api/queue/${roomId}/display-paused?${params}`, {
    method: "POST",
  });
  return resp.ok;
}
