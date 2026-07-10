export default async function createRoom(
  roomId: string,
  // The play token this device stored the last time it started a song here.
  // Lets the server tell a reloading playback surface (reset play state)
  // apart from an additional host device joining (leave the song alone).
  priorPlayToken?: string | null
): Promise<boolean> {
  try {
    const resp = await fetch(`/api/queue/${roomId}`, {
      method: "POST",
      headers: priorPlayToken ? { "x-play-token": priorPlayToken } : undefined,
    });
    return resp.ok;
  } catch {
    return false;
  }
}
