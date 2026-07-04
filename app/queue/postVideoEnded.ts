export default async function postVideoEnded(
  roomId: string,
  endedIndex: number
): Promise<boolean> {
  const params = new URLSearchParams({ index: String(endedIndex) });
  const resp = await fetch(`/api/queue/${roomId}/video-ended?${params}`, {
    method: "POST",
  });
  return resp.ok;
}
