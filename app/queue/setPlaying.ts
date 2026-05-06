export default async function setPlaying(
  roomId: string,
  isPlaying: boolean
): Promise<boolean> {
  const params = new URLSearchParams({ isPlaying: String(isPlaying) });
  const resp = await fetch(`/api/queue/${roomId}/play?${params}`, {
    method: "POST",
  });
  return resp.ok;
}
