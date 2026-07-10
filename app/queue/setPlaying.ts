export default async function setPlaying(
  roomId: string,
  isPlaying: boolean,
  // When starting a song, the token that marks this device as the playback
  // surface (see Room.playToken). Omitted when stopping.
  playToken?: string
): Promise<boolean> {
  const params = new URLSearchParams({ isPlaying: String(isPlaying) });
  if (isPlaying && playToken) params.set("playToken", playToken);
  try {
    const resp = await fetch(`/api/queue/${roomId}/play?${params}`, {
      method: "POST",
    });
    return resp.ok;
  } catch {
    return false;
  }
}
