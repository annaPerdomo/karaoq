export default async function removeSingWithMe(
  roomId: string,
  postId: string
): Promise<boolean> {
  const resp = await fetch(
    `/api/queue/${roomId}/sing-with-me-remove?postId=${encodeURIComponent(postId)}`,
    { method: "POST" }
  );
  return resp.ok;
}
