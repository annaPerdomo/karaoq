import type { IdeaShelf } from '../../lib/shelfTypes';

/** Never throws: no shelves just means the browse view opens on categories. */
export default async function fetchShelves(
  country: string | null,
  signal?: AbortSignal
): Promise<IdeaShelf[]> {
  try {
    const qs = country ? `?c=${encodeURIComponent(country)}` : '';
    const res = await fetch(`/api/suggestions/shelves${qs}`, signal ? { signal } : undefined);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.shelves) ? data.shelves : [];
  } catch {
    return [];
  }
}
