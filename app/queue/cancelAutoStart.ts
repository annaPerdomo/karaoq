export default async function cancelAutoStart(roomId: string): Promise<boolean> {
  try {
    const resp = await fetch(`/api/queue/${roomId}/auto-advance?cancel=1`, {
      method: "POST",
    });
    return resp.ok;
  } catch {
    return false;
  }
}
