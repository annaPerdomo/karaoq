import * as React from 'react';

import fetchWorldCharts from '../../../app/queue/fetchWorldCharts';
import type { SongSection } from '../../../app/queue/songSuggestions';
import type { IdeaShelf } from '../../../lib/shelfTypes';
import { SECTION_COUNTRY } from '../constants';

const STORAGE_KEY = 'karaoq_world_place';

/** Where a first look lands when nothing's remembered: the places people are
 *  most curious about, skipping the singer's own. */
const DEFAULT_ORDER = ['JP', 'KR', 'GB', 'US', 'BR', 'MX', 'FR', 'ES', 'PH', 'DE'];

export function defaultPlace(
  available: string[],
  home: string | null,
  remembered: string | null
): string | null {
  if (remembered && available.indexOf(remembered) >= 0) return remembered;
  const others = available.filter((cc) => cc !== home);
  return DEFAULT_ORDER.find((cc) => others.indexOf(cc) >= 0) ?? others[0] ?? available[0] ?? null;
}

export interface WorldPlace {
  country: string;
  /** Today's chart, when it has enough singable songs to browse. */
  chart: IdeaShelf | null;
  /** The place's hand-picked classics, when a language list covers it. */
  section: SongSection | null;
}

/** A place is any charted country or any language list's country. */
export function buildPlaces(charts: IdeaShelf[], sections: SongSection[]): WorldPlace[] {
  const byCountry = new Map<string, WorldPlace>();
  const place = (cc: string) => {
    if (!byCountry.has(cc)) byCountry.set(cc, { country: cc, chart: null, section: null });
    return byCountry.get(cc)!;
  };
  for (const chart of charts) if (chart.country) place(chart.country).chart = chart;
  for (const section of sections) {
    const cc = SECTION_COUNTRY[section.id];
    if (cc && !place(cc).section) place(cc).section = section;
  }
  return Array.from(byCountry.values());
}

// Owns the World tab's place: every country's chart arrives in one request and
// the language lists are already loaded, so switching places is local. The
// pick is remembered per device.
export function useWorldPlaces(home: string | null, sections: SongSection[]) {
  const [charts, setCharts] = React.useState<IdeaShelf[]>([]);
  const [picked, setPicked] = React.useState<string | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    fetchWorldCharts(controller.signal).then((loaded) => {
      if (!controller.signal.aborted) setCharts(loaded);
    });
    return () => controller.abort();
  }, []);

  const places = buildPlaces(charts, sections);
  let remembered: string | null = null;
  try {
    remembered = localStorage.getItem(STORAGE_KEY);
  } catch {}
  const country = picked ?? defaultPlace(places.map((p) => p.country), home, remembered);
  const current = places.find((p) => p.country === country) ?? null;

  function pick(cc: string) {
    setPicked(cc);
    try {
      localStorage.setItem(STORAGE_KEY, cc);
    } catch {}
  }

  return { places, current, pick };
}
