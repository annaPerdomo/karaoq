import decodeHtml from '../../lib/decodeHtml';

export interface YoutubeResult {
  title: string;
  thumbnailUrl: string;
  videoId: string;
}

export type VideoDuration = 'any' | 'short' | 'medium' | 'long';
export type SortOrder = 'relevance' | 'viewCount' | 'date' | 'rating';

export interface SearchFilters {
  duration: VideoDuration;
  sortBy: SortOrder;
}

// All searches go through /api/search so the YouTube API key stays
// server-side (and results are cached there to conserve quota).
export default async function searchYoutube(
  query: string,
  filters: SearchFilters = { duration: 'any', sortBy: 'relevance' },
  signal?: AbortSignal
): Promise<YoutubeResult[]> {
  const params = new URLSearchParams({
    q: query,
    duration: filters.duration,
    sortBy: filters.sortBy,
  });
  const resp = await fetch(`/api/search?${params}`, signal ? { signal } : undefined);
  if (!resp.ok) return [];
  const data = await resp.json();
  return Array.isArray(data)
    ? data.map((item: any) => ({
        title: decodeHtml(item.title ?? ''),
        thumbnailUrl: item.thumbnailUrl ?? '',
        videoId: item.videoId ?? '',
      }))
    : [];
}
