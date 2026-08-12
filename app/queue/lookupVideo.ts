import {
  SearchUnavailableError,
  toYoutubeResult,
  YoutubeResult,
} from './searchYoutube';

/**
 * Resolves one YouTube video id to an addable result via /api/video-lookup —
 * the 1-quota-unit path a pasted link takes instead of the 101-unit search.
 *
 * Throws SearchUnavailableError like searchYoutube does; `reason` carries
 * 'not_found' (404), 'not_embeddable' (422) or 'quota' (503) so the caller can
 * tell "bad link" apart from "our backend is having a minute".
 */
export default async function lookupVideo(
  videoId: string,
  // Which surface asked. Diagnostic only — it never affects the result.
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
  // A 200 with nothing in it is the same outcome as a 404 to the user, and
  // reusing that status keeps the caller's error matrix to one branch.
  if (!item) throw new SearchUnavailableError(404, { reason: 'not_found' });
  return toYoutubeResult(item);
}
