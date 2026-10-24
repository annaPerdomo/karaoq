import type { IdeaShelf } from '../../lib/shelfTypes';

/** Never throws: no shelves just means the browse view opens on categories. */
export default async function fetchShelves(
  country: string | null,
  locale: string,
  signal?: AbortSignal
): Promise<IdeaShelf[]> {
  try {
    const params = new URLSearchParams({ l: locale });
    if (country) params.set('c', country);
    const res = await fetch(`/api/suggestions/shelves?${params}`, signal ? { signal } : undefined);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.shelves) ? data.shelves : [];
  } catch {
    return [];
  }
}
