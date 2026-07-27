import decodeHtml from '../../lib/decodeHtml';

export interface YoutubeResult {
  title: string;
  thumbnailUrl: string;
  videoId: string;
  // Optional: cached results written before metadata enrichment shipped (and
  // degraded fallback results) won't carry these.
  durationSeconds?: number;
  viewCount?: number;
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
        ...(typeof item.durationSeconds === 'number' && item.durationSeconds > 0
          ? { durationSeconds: item.durationSeconds }
          : {}),
        ...(typeof item.viewCount === 'number' && item.viewCount > 0
          ? { viewCount: item.viewCount }
          : {}),
      }))
    : [];
}
