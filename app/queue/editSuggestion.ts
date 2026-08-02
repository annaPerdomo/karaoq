export interface SuggestionEdit {
  songTitle: string;
  videoId: string;
  /** Length of the (possibly newly picked) song; omitted leaves the stored one. */
  durationSeconds?: number;
  /** Supplied when the requester edits their own request (enforced server-side);
   *  omitted for host moderation, which can edit any request. */
  userName?: string;
}

export default async function editSuggestion(
  roomId: string,
  suggestionId: string,
  edit: SuggestionEdit
): Promise<boolean> {
  try {
    const resp = await fetch(`/api/queue/${roomId}/suggestions-edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suggestionId, ...edit }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}
