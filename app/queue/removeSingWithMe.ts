export default async function removeSingWithMe(
  roomId: string,
  postId: string,
  // Supplied when a singer removes their own post (enforced server-side).
  // Omitted for host moderation, which can remove any post.
  userName?: string
): Promise<boolean> {
  const params = new URLSearchParams({ postId });
  if (userName) params.set("userName", userName);
  const resp = await fetch(
    `/api/queue/${roomId}/sing-with-me-remove?${params.toString()}`,
    { method: "POST" }
  );
  return resp.ok;
}
