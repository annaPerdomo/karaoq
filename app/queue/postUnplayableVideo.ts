/** Fire-and-forget: the notice is already up, and the server decides for itself
 *  whether the video is really unplayable. */
export default function postUnplayableVideo(
  roomId: string,
  videoId: string,
  code: number
): void {
  fetch("/api/queue/unplayable", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId, videoId, code }),
  }).catch(() => {});
}
