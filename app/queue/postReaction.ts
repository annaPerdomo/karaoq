import { CheerSource } from "./cheerConstants";

export default async function postReaction(
  roomId: string,
  reactionId: string,
  emoji: string,
  userName: string,
  clientId?: string,
  source?: CheerSource
): Promise<boolean> {
  const params = new URLSearchParams({
    reactionId,
    emoji,
    userName,
  });
  if (clientId) params.set("clientId", clientId);
  if (source) params.set("source", source);

  try {
    const resp = await fetch(`/api/queue/${roomId}/reactions?${params}`, {
      method: "POST",
    });
    return resp.ok;
  } catch {
    return false;
  }
}
