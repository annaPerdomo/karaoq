// Kept free of the Mongo driver (unlike songChartsServer.ts) so the shared
// song-chart component can import these constants without pulling it into
// the browser bundle.

import { localePath, SITE_URL, type Locale } from './i18n/config';

export interface ChartSong {
  title: string;
  artist: string;
}

export const CHART_MIN_SONGS = 15;
export const CHART_LIMIT = 50;

export function songsUrl(locale: Locale): string {
  return `${SITE_URL}${localePath(locale)}/songs`;
}

export function songsCountryUrl(country: string, locale: Locale): string {
  return `${SITE_URL}${localePath(locale)}/songs/${country}`;
}
