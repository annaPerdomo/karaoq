export default async function postReaction(
  roomId: string,
  reactionId: string,
  emoji: string,
  userName: string
): Promise<boolean> {
  const params = new URLSearchParams({
    reactionId,
    emoji,
    userName,
  });

  try {
    const resp = await fetch(`/api/queue/${roomId}/reactions?${params}`, {
      method: "POST",
    });
    return resp.ok;
  } catch {
    return false;
  }
}
