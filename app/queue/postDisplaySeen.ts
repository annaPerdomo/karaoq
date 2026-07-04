export default async function postDisplaySeen(roomId: string): Promise<boolean> {
  const resp = await fetch(`/api/queue/${roomId}/display-seen`, {
    method: "POST",
  });
  return resp.ok;
}
