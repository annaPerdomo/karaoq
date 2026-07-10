export default async function claimSuggestion(
  roomId: string,
  suggestionId: string,
  userName: string
): Promise<boolean> {
  try {
    const resp = await fetch(`/api/queue/${roomId}/suggestions-claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suggestionId, userName }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}
