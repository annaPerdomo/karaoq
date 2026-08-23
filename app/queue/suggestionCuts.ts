import {
  SearchUnavailableError,
  toYoutubeResult,
  YoutubeResult,
} from './searchYoutube';

/** Throws SearchUnavailableError like searchYoutube; a 404 is the caller's cue
 *  to run the search it always did. */
export default async function suggestionCuts(
  songKey: string,
  signal?: AbortSignal
): Promise<YoutubeResult[]> {
  const params = new URLSearchParams({ song: songKey });
  const resp = await fetch(
    `/api/suggestions/cuts?${params}`,
    signal ? { signal } : undefined
  );
  if (!resp.ok) throw new SearchUnavailableError(resp.status);
  const data = await resp.json();
  const results = Array.isArray(data) ? data.map(toYoutubeResult) : [];
  // An empty list would render as "no songs found" for a song we suggested.
  if (results.length === 0) throw new SearchUnavailableError(404);
  return results;
}
