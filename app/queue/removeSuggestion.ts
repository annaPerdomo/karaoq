export default async function removeSuggestion(
  roomId: string,
  suggestionId: string,
  // Supplied when a singer withdraws their own suggestion (enforced
  // server-side). Omitted for host moderation, which can remove any.
  userName?: string
): Promise<boolean> {
  const params = new URLSearchParams({ suggestionId });
  if (userName) params.set("userName", userName);
  const resp = await fetch(
    `/api/queue/${roomId}/suggestions-remove?${params.toString()}`,
    { method: "POST" }
  );
  return resp.ok;
}
