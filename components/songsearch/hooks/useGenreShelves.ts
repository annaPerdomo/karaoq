import * as React from 'react';

import { PLACE_GENRES } from '../../../lib/genreCharts';
import type { GenreShelf } from '../../../lib/shelfTypes';

async function fetchGenres(place: string, signal: AbortSignal): Promise<GenreShelf[] | null> {
  try {
    const res = await fetch(`/api/suggestions/genres?c=${encodeURIComponent(place)}`, { signal });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data?.genres) ? data.genres : null;
  } catch {
    return null;
  }
}

export function useGenreShelves(place: string) {
  const [byPlace, setByPlace] = React.useState<Record<string, GenreShelf[]>>({});
  const [openSlug, setOpenSlug] = React.useState<string | null>(null);
  const failedRef = React.useRef<Record<string, true>>({});
  const charted = !!PLACE_GENRES[place.toLowerCase()];

  React.useEffect(() => {
    setOpenSlug(null);
    if (!charted || (byPlace[place] && !failedRef.current[place])) return;
    const controller = new AbortController();
    fetchGenres(place, controller.signal).then((loaded) => {
      if (controller.signal.aborted) return;
      // Retried the next time the place is picked.
      if (loaded === null) failedRef.current[place] = true;
      else delete failedRef.current[place];
      setByPlace((held) => ({ ...held, [place]: loaded ?? [] }));
    });
    return () => controller.abort();
    // byPlace is read, not watched: a place's own load must not re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place, charted]);

  const genres = charted ? byPlace[place] ?? [] : [];
  return {
    genres,
    openGenre: genres.find((g) => g.slug === openSlug) ?? null,
    open: setOpenSlug,
    close: () => setOpenSlug(null),
  };
}
