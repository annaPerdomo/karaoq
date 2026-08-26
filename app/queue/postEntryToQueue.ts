import { QueueEntry } from "../../pages/api/types";

export default async function postEntryToQueue(
  roomId: string,
  entry: QueueEntry,
  via?: "search" | "paste",
  /** Set when these results came from tapping a catalogued suggestion: the
   *  corpus learns which cut singers queue from it. */
  suggestionKey?: string,
  fromCorpus?: boolean
): Promise<boolean> {
  try {
    const resp = await fetch(`/api/queue/${roomId}/videos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entryId: entry.id,
        userName: entry.userName,
        videoId: entry.videoId,
        songTitle: entry.songTitle,
        durationSeconds: entry.durationSeconds,
        ...(via ? { via } : {}),
        ...(suggestionKey ? { suggestionKey } : {}),
        ...(suggestionKey && typeof fromCorpus === "boolean" ? { fromCorpus } : {}),
      }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}
