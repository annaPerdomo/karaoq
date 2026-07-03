export default async function joinSingWithMe(
  roomId: string,
  postId: string,
  userName: string
): Promise<boolean> {
  const resp = await fetch(`/api/queue/${roomId}/sing-with-me-join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ postId, userName }),
  });
  return resp.ok;
}
