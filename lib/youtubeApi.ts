// Shared YouTube Data API plumbing for the two endpoints that call it:
// /api/search (search.list + enrichment) and /api/video-lookup (videos.list).
// Both need the same quota detection, so it lives here rather than in either.

/** A YouTube API failure, flagged when the cause is a spent quota so callers
 * can say when search comes back rather than "try again shortly". */
export class YoutubeApiError extends Error {
  quotaExceeded: boolean;
  constructor(message: string, quotaExceeded: boolean) {
    super(message);
    this.name = "YoutubeApiError";
    this.quotaExceeded = quotaExceeded;
  }
}

/** GETs a YouTube Data API URL and returns its parsed body, throwing a
 * YoutubeApiError on any failure. */
export async function fetchYoutubeApi(
  url: string,
  timeoutMs: number
): Promise<any> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  // Parse the body even on a non-2xx: the reason code is the only way to tell
  // "out of quota for today" apart from a key/config problem, and YouTube
  // reports an exhausted quota as either 403 quotaExceeded or 429
  // rateLimitExceeded / RESOURCE_EXHAUSTED depending which limit tripped.
  const data = await resp.json().catch(() => null);
  const apiError = data?.error;
  if (!resp.ok || apiError) {
    const reason = apiError?.errors?.[0]?.reason ?? "";
    const exhausted =
      reason === "quotaExceeded" ||
      reason === "rateLimitExceeded" ||
      apiError?.status === "RESOURCE_EXHAUSTED" ||
      resp.status === 429;
    throw new YoutubeApiError(
      apiError?.message || `YouTube API ${resp.status}`,
      exhausted
    );
  }
  return data;
}
