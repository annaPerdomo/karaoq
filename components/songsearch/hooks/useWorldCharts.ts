import * as React from 'react';

import fetchWorldCharts from '../../../app/queue/fetchWorldCharts';
import type { IdeaShelf } from '../../../lib/shelfTypes';

const STORAGE_KEY = 'karaoq_world_chart';

/** Where a first look lands when nothing's remembered: the charts people are
 *  most curious about, skipping the singer's own. */
const DEFAULT_ORDER = ['JP', 'KR', 'GB', 'US', 'BR', 'MX', 'FR', 'ES', 'PH', 'DE'];

export function defaultWorldChart(
  available: string[],
  home: string | null,
  remembered: string | null
): string | null {
  if (remembered && available.indexOf(remembered) >= 0) return remembered;
  const others = available.filter((cc) => cc !== home);
  return DEFAULT_ORDER.find((cc) => others.indexOf(cc) >= 0) ?? others[0] ?? available[0] ?? null;
}

// Owns "Charts around the world": every country's chart arrives in one
// request, so switching countries is local. The pick is remembered per device.
export function useWorldCharts(home: string | null) {
  const [charts, setCharts] = React.useState<IdeaShelf[]>([]);
  const [picked, setPicked] = React.useState<string | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    fetchWorldCharts(controller.signal).then((loaded) => {
      if (!controller.signal.aborted) setCharts(loaded);
    });
    return () => controller.abort();
  }, []);

  const available = charts.map((c) => c.country ?? '').filter(Boolean);
  let remembered: string | null = null;
  try {
    remembered = localStorage.getItem(STORAGE_KEY);
  } catch {}
  const country = picked ?? defaultWorldChart(available, home, remembered);
  const chart = charts.find((c) => c.country === country) ?? null;

  function pick(cc: string) {
    setPicked(cc);
    try {
      localStorage.setItem(STORAGE_KEY, cc);
    } catch {}
  }

  return { charts, country, chart, pick };
}
