import {
  SearchUnavailableError,
  toYoutubeResult,
  YoutubeResult,
} from './searchYoutube';

/** Throws SearchUnavailableError like searchYoutube, with `reason` carrying
 * 'not_found', 'not_embeddable' or 'quota' so callers can tell a bad link
 * apart from a backend failure. */
export default async function lookupVideo(
  videoId: string,
  src: 'paste' | 'trending',
  signal?: AbortSignal,
  roomId?: string
): Promise<YoutubeResult> {
  const params = new URLSearchParams({ id: videoId, src });
  if (roomId) params.set('roomId', roomId);
  const resp = await fetch(
    `/api/video-lookup?${params}`,
    signal ? { signal } : undefined
  );
  if (!resp.ok) {
    const detail = await resp.json().catch(() => null);
    throw new SearchUnavailableError(resp.status, {
      reason: detail?.reason,
      resetsAt: detail?.resetsAt,
    });
  }
  const data = await resp.json();
  const item = Array.isArray(data) ? data[0] : null;
  // A 200 with nothing in it is the same outcome as a 404 to the user.
  if (!item) throw new SearchUnavailableError(404, { reason: 'not_found' });
  return toYoutubeResult(item);
}
