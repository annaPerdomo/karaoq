/** `origin` is what the IFrame API checks its messages against. Empty on the
 *  server, where no room has loaded yet and the player never renders. */
export function embedSrc(videoId: string, params: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return (
    `https://www.youtube.com/embed/${videoId}?${params}` +
    (origin ? `&origin=${encodeURIComponent(origin)}` : "")
  );
}
