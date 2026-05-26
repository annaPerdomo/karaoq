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

function decodeHtml(html: string): string {
  if (typeof document === 'undefined') return html;
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  return txt.value;
}

async function searchWithYoutubeApi(
  query: string,
  filters: SearchFilters,
  signal?: AbortSignal
): Promise<YoutubeResult[]> {
  const params = new URLSearchParams({
    part: 'snippet',
    q: query,
    videoEmbeddable: 'true',
    key: process.env.NEXT_PUBLIC_YOUTUBE_API_KEY!,
    type: 'video',
    maxResults: '8',
    order: filters.sortBy,
  });

  if (filters.duration !== 'any') {
    params.set('videoDuration', filters.duration);
  }

  const resp = await fetch(
    'https://www.googleapis.com/youtube/v3/search?' + params,
    signal ? { signal } : undefined
  );

  if (!resp.ok) throw new Error(`YouTube API ${resp.status}`);

  const data = await resp.json();

  if (data.error) throw new Error(data.error.message || 'YouTube API error');

  return (
    data.items?.map((item: any) => ({
      title: decodeHtml(item.snippet.title),
      thumbnailUrl:
        item.snippet.thumbnails.medium?.url ||
        item.snippet.thumbnails.default?.url,
      videoId: item.id.videoId,
    })) ?? []
  );
}

async function searchWithFallback(
  query: string,
  signal?: AbortSignal
): Promise<YoutubeResult[]> {
  const params = new URLSearchParams({ q: query });
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

export default async function searchYoutube(
  query: string,
  filters: SearchFilters = { duration: 'any', sortBy: 'relevance' },
  signal?: AbortSignal
): Promise<YoutubeResult[]> {
  try {
    return await searchWithYoutubeApi(query, filters, signal);
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
    console.warn('YouTube API failed, falling back to server-side search:', err.message);
    return searchWithFallback(query, signal);
  }
}
