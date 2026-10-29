import * as React from 'react';

import fetchWorldCharts from '../../../app/queue/fetchWorldCharts';
import type { IdeaShelf } from '../../../lib/shelfTypes';
import { placesFor } from '../placeLists';

// The place every song-ideas tab follows. It opens on the singer's own country
// every visit — ideas mean here unless they choose otherwise — and only a pick
// elsewhere costs anything: every other country's chart arrives in one cached
// request, fetched the first time one is chosen.
export function usePlace(home: string | null) {
  const homeValue = home ?? '';
  const [place, setPlace] = React.useState(homeValue);
  const [charts, setCharts] = React.useState<IdeaShelf[] | null>(null);
  const loadingRef = React.useRef(false);

  // Follows the country once geo resolves, until the singer picks.
  const pickedRef = React.useRef(false);
  React.useEffect(() => {
    if (!pickedRef.current) setPlace(homeValue);
  }, [homeValue]);

  function pick(next: string) {
    pickedRef.current = true;
    setPlace(next);
    if (next === homeValue || charts || loadingRef.current) return;
    loadingRef.current = true;
    fetchWorldCharts().then((loaded) => {
      loadingRef.current = false;
      setCharts(loaded);
    });
  }

  const atHome = place === homeValue;
  return {
    place,
    places: placesFor(home),
    atHome,
    /** Another country's chart; null at home, while loading, or when that
     *  chart isn't deep enough to browse yet. */
    chart: atHome ? null : charts?.find((c) => c.country === place) ?? null,
    chartLoading: !atHome && charts === null,
    pick,
  };
}
