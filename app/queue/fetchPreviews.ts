import type { CutPreview } from '../../lib/shelfTypes';
import { buildSearchQuery, searchCacheKey } from '../../lib/searchQuery';
import { buildSongQuery, SongSuggestion } from './songSuggestions';

/** The key the corpus (and the add's suggestionKey) knows this idea by. */
export function ideaKey(song: SongSuggestion): string {
  return searchCacheKey(buildSearchQuery(buildSongQuery(song), true));
}

/** Never throws: a category without previews still browses, one search per tap. */
export default async function fetchPreviews(
  categoryId: string,
  signal?: AbortSignal
): Promise<Record<string, CutPreview>> {
  try {
    const res = await fetch(
      `/api/suggestions/previews?category=${encodeURIComponent(categoryId)}`,
      signal ? { signal } : undefined
    );
    if (!res.ok) return {};
    const data = await res.json();
    return data?.previews && typeof data.previews === 'object' ? data.previews : {};
  } catch {
    return {};
  }
}
