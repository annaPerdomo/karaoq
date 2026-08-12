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

/** Thrown when /api/search responds non-2xx (quota exhausted, rate-limited,
 * etc.) so callers can tell "backend is down" apart from "no results". */
export class SearchUnavailableError extends Error {
  status: number;
  /** 'quota' once the day's YouTube search budget is spent. */
  reason?: string;
  /** ISO time the quota frees up, when the server knows it. */
  resetsAt?: string;
  constructor(status: number, detail?: { reason?: string; resetsAt?: string }) {
    super(`Search unavailable (${status})`);
    this.name = 'SearchUnavailableError';
    this.status = status;
    this.reason = detail?.reason;
    this.resetsAt = detail?.resetsAt;
  }
}

export interface SearchFailure {
  /** Day's YouTube search budget is spent, as opposed to a transient blip. */
  quota: boolean;
  /** ISO time the quota frees up, when the server knows it. */
  resetsAt?: string;
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
  signal?: AbortSignal,
  // Purely diagnostic: lets a failed search be attributed to the room that ran
  // it on /admin. Results are unaffected (the cache key ignores it).
  roomId?: string
): Promise<YoutubeResult[]> {
  const params = new URLSearchParams({
    q: query,
    duration: filters.duration,
    sortBy: filters.sortBy,
  });
  if (roomId) params.set('roomId', roomId);
  const resp = await fetch(`/api/search?${params}`, signal ? { signal } : undefined);
  if (!resp.ok) {
    const detail = await resp.json().catch(() => null);
    throw new SearchUnavailableError(resp.status, {
      reason: detail?.reason,
      resetsAt: detail?.resetsAt,
    });
  }
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
