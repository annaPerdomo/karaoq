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

export default async function searchYoutube(
  query: string,
  filters: SearchFilters = { duration: 'any', sortBy: 'relevance' },
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
  const data = await resp.json();

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
