export default async function updatePosition(
  roomId: string,
  activeVideoIndex: number
): Promise<boolean> {
  const params = new URLSearchParams({
    activeVideoIndex: String(activeVideoIndex),
  });
  const resp = await fetch(`/api/queue/${roomId}/position?${params}`, {
    method: "POST",
  });
  return resp.ok;
}
