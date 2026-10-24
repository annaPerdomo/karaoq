import type { IdeaShelf } from '../../lib/shelfTypes';

/** Never throws: no charts just means the section doesn't render. */
export default async function fetchWorldCharts(signal?: AbortSignal): Promise<IdeaShelf[]> {
  try {
    const res = await fetch('/api/suggestions/world', signal ? { signal } : undefined);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.charts) ? data.charts : [];
  } catch {
    return [];
  }
}
