export default async function postScreenTest(roomId: string): Promise<boolean> {
  try {
    const resp = await fetch(`/api/queue/${roomId}/screen-test`, { method: "POST" });
    return resp.ok;
  } catch {
    return false;
  }
}
