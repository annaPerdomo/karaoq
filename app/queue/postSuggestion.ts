import { v4 as uuidv4 } from "uuid";

export interface SuggestionInput {
  songTitle: string;
  videoId: string;
  suggestedBy: string;
  anonymous: boolean;
}

export default async function postSuggestion(
  roomId: string,
  input: SuggestionInput
): Promise<boolean> {
  try {
    const resp = await fetch(`/api/queue/${roomId}/suggestions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: uuidv4(), ...input }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}
