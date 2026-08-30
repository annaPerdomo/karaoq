export default async function setPlaying(
  roomId: string,
  isPlaying: boolean,
  // When starting a song, the token that marks this device as the playback
  // surface (see Room.playToken). Omitted when stopping.
  playToken?: string,
  // Adopting a surface-less start rather than starting one. The server turns
  // this into a compare-and-set on the token still being free, so a false
  // return means another screen claimed it first — not that the write failed.
  claim = false
): Promise<boolean> {
  const params = new URLSearchParams({ isPlaying: String(isPlaying) });
  if (isPlaying && playToken) params.set("playToken", playToken);
  if (claim) params.set("claim", "1");
  try {
    const resp = await fetch(`/api/queue/${roomId}/play?${params}`, {
      method: "POST",
    });
    return resp.ok;
  } catch {
    return false;
  }
}
