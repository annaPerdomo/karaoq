export default async function createRoom(roomId: string): Promise<boolean> {
  const resp = await fetch(`/api/queue/${roomId}`, { method: "POST" });
  return resp.ok;
}
