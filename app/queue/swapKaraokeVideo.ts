import type { OriginalVideoCandidate } from "../../lib/originalVideo";

export type KaraokeSwapSource = "candidate" | "link" | "search";

/** Resolves to the restarted clock for a live song, null for one still waiting,
 *  or false when the swap didn't land. */
export default async function swapKaraokeVideo(
  roomId: string,
  entryId: string,
  video: OriginalVideoCandidate,
  source: KaraokeSwapSource
): Promise<string | null | false> {
  try {
    const resp = await fetch(`/api/queue/${roomId}/karaoke-video`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entryId,
        videoId: video.videoId,
        title: video.title,
        durationSeconds: video.durationSeconds,
        source,
      }),
    });
    if (!resp.ok) return false;
    const body = (await resp.json()) as { playStartedAt?: string | null };
    return body.playStartedAt ?? null;
  } catch {
    return false;
  }
}
