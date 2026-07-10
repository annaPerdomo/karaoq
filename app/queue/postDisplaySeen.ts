export default async function postDisplaySeen(roomId: string): Promise<boolean> {
  try {
    const resp = await fetch(`/api/queue/${roomId}/display-seen`, {
      method: "POST",
    });
    return resp.ok;
  } catch {
    return false;
  }
}
