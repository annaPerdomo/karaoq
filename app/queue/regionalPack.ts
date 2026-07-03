import type { SongSection } from './songSuggestions';

// Regional packs are static JSON in /public/suggestions/ — CDN-cached, zero
// bundle cost, and only fetched for visitors whose country maps to one.
const memo = new Map<string, Promise<SongSection | null>>();

function isValidSection(data: any): data is SongSection {
  return (
    data &&
    typeof data.id === 'string' &&
    typeof data.label === 'string' &&
    Array.isArray(data.categories) &&
    data.categories.every(
      (cat: any) =>
        cat &&
        typeof cat.id === 'string' &&
        typeof cat.name === 'string' &&
        typeof cat.emoji === 'string' &&
        Array.isArray(cat.songs) &&
        cat.songs.every(
          (s: any) =>
            s &&
            typeof s.title === 'string' &&
            typeof s.artist === 'string' &&
            (s.nativeTitle === undefined || typeof s.nativeTitle === 'string') &&
            (s.nativeArtist === undefined || typeof s.nativeArtist === 'string')
        )
    )
  );
}

export default function fetchRegionalPack(packId: string): Promise<SongSection | null> {
  const existing = memo.get(packId);
  if (existing) return existing;

  const promise = fetch(`/suggestions/${packId}.json`)
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => (isValidSection(data) ? data : null))
    .catch(() => null);
  // Cache only successes so a transient network failure can retry later.
  promise.then((result) => {
    if (!result) memo.delete(packId);
  });
  memo.set(packId, promise);
  return promise;
}
