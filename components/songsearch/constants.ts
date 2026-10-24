import { VideoDuration, SortOrder } from '../../app/queue/searchYoutube';

export const DURATION_OPTIONS: { value: VideoDuration; tKey: string }[] = [
  { value: 'any', tKey: 'search.duration.any' },
  { value: 'short', tKey: 'search.duration.short' },
  { value: 'medium', tKey: 'search.duration.medium' },
  { value: 'long', tKey: 'search.duration.long' },
];

// The server returns up to 50 per search (one quota spend); "Show more" pages
// through the rest client-side without another request.
export const INITIAL_RESULTS = 8;

export const SORT_OPTIONS: { value: SortOrder; tKey: string }[] = [
  { value: 'relevance', tKey: 'search.sort.relevance' },
  { value: 'viewCount', tKey: 'search.sort.viewCount' },
  { value: 'date', tKey: 'search.sort.date' },
  { value: 'rating', tKey: 'search.sort.rating' },
];

// Language-pack sections promoted to their own top-level tab for certain
// countries; everywhere else they live under the shared "Language" tab.
export const LANG_IDS = ['spanish', 'kpop', 'japanese'];

export const INITIAL_CATEGORY_SONGS = 8;

/** The synthetic first tab holding the hot/rooms shelves (lib/shelves). */
export const HOT_TAB = 'hot';

/** The synthetic tab that pairs each place's live chart with its classics. */
export const WORLD_TAB = 'world';

/** Which chart each language list's place is. Every list the World tab
 *  offers needs one, or it would never be offered (tests/lib/countryModes). */
export const SECTION_COUNTRY: Record<string, string> = {
  spanish: 'MX',
  kpop: 'KR',
  japanese: 'JP',
  brasil: 'BR',
  cesko: 'CZ',
  deutsch: 'DE',
  francais: 'FR',
  indonesia: 'ID',
  bollywood: 'IN',
  opm: 'PH',
};
