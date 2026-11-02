import type { IdeaShelf } from '../../lib/shelfTypes';

export default async function fetchShelves(
  country: string | null,
  locale: string,
  signal?: AbortSignal
): Promise<IdeaShelf[] | null> {
  try {
    // lib/shelves ignores the language once the country is known; sending it anyway splits the CDN cache.
    const params = new URLSearchParams(country ? { c: country } : { l: locale });
    const res = await fetch(`/api/suggestions/shelves?${params}`, signal ? { signal } : undefined);
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data?.shelves) ? data.shelves : null;
  } catch {
    return null;
  }
}
