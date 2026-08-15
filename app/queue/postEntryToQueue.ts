import { QueueEntry } from "../../pages/api/types";

export default async function postEntryToQueue(
  roomId: string,
  entry: QueueEntry,
  via?: "search" | "paste"
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
      }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}
