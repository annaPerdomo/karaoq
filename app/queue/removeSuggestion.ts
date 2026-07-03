export default async function removeSuggestion(
  roomId: string,
  suggestionId: string
): Promise<boolean> {
  const resp = await fetch(
    `/api/queue/${roomId}/suggestions-remove?suggestionId=${encodeURIComponent(
      suggestionId
    )}`,
    { method: "POST" }
  );
  return resp.ok;
}
