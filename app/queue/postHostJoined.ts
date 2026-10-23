export default async function postHostJoined(roomId: string): Promise<boolean> {
  try {
    const resp = await fetch(`/api/queue/${roomId}/host-joined`, {
      method: "POST",
    });
    return resp.ok;
  } catch {
    return false;
  }
}
