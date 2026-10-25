import * as React from 'react';

import fetchWorldCharts from '../../../app/queue/fetchWorldCharts';
import type { SongSection } from '../../../app/queue/songSuggestions';
import { CHART_COUNTRIES } from '../../../lib/chartCountries';
import type { IdeaShelf } from '../../../lib/shelfTypes';
import { SECTION_COUNTRY } from '../constants';

/** Every place the picker offers: each charted country, each language list's
 *  country, and the singer's own ("" when we don't know where they are). */
export function placesFor(home: string | null): string[] {
  const all = new Set<string>(CHART_COUNTRIES.map((cc) => cc.toUpperCase()));
  Object.keys(SECTION_COUNTRY).forEach((id) => all.add(SECTION_COUNTRY[id]));
  all.add(home ?? '');
  return Array.from(all);
}

/** The language list that covers a place, if any. */
export function sectionFor(place: string, sections: SongSection[]): SongSection | null {
  return sections.find((s) => SECTION_COUNTRY[s.id] === place) ?? null;
}

// Owns the Hot tab's place. It opens on the singer's own country every visit —
// Hot means here unless they choose otherwise — and only a pick elsewhere
// costs anything: every other country's chart arrives in one cached request,
// fetched the first time one is chosen.
export function useHotPlace(home: string | null, onLeaveHome: () => void) {
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
    if (next === homeValue) return;
    onLeaveHome();
    if (charts || loadingRef.current) return;
    loadingRef.current = true;
    fetchWorldCharts().then((loaded) => {
      loadingRef.current = false;
      setCharts(loaded);
    });
  }

  const atHome = place === homeValue;
  const chart = atHome ? null : charts?.find((c) => c.country === place) ?? null;
  return {
    place,
    places: placesFor(home),
    atHome,
    chart,
    /** Charts requested but not back yet — the classics can show meanwhile. */
    loading: !atHome && charts === null,
    pick,
  };
}
