// Supported UI locales. English is the bundled base + fallback; every other
// locale is a static JSON catalog served from /public/i18n/{locale}.json
// (CDN-cached, lazy-fetched) so adding a language costs zero recurring spend —
// the same zero-cost philosophy as the song-suggestion language packs.

export type Locale =
  | 'en'
  | 'ja'
  | 'fil'
  | 'es'
  | 'ko'
  | 'pt'
  | 'de'
  | 'id'
  | 'cs'
  | 'fr';

export const DEFAULT_LOCALE: Locale = 'en';

/** Locales that ship as their own JSON catalog under /public/i18n. */
export const SUPPORTED_LOCALES: Locale[] = [
  'en',
  'ja',
  'fil',
  'es',
  'ko',
  'pt',
  'de',
  'id',
  'cs',
  'fr',
];

/** Native-language label for each locale, shown in the language switcher. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  ja: '日本語',
  fil: 'Filipino',
  es: 'Español',
  ko: '한국어',
  pt: 'Português',
  de: 'Deutsch',
  id: 'Bahasa Indonesia',
  cs: 'Čeština',
  fr: 'Français',
};

/**
 * Compact native label for the switcher pill's always-visible trigger. Same as
 * LOCALE_LABELS but shortened where the full endonym is too wide for a header
 * pill. The dropdown still shows the full LOCALE_LABELS name.
 */
export const LOCALE_SHORT_LABELS: Record<Locale, string> = {
  ...LOCALE_LABELS,
  id: 'Indonesia',
};

const SPANISH = 'es' as const;

/**
 * Default UI locale for a visitor's ISO-3166 country (from /api/geo). Mirrors
 * the karaoke markets the suggestion packs already target. Only used as a
 * fallback when the browser's own language isn't one we support — an explicit
 * choice or navigator.language always wins.
 */
export const COUNTRY_TO_LOCALE: Record<string, Locale> = {
  JP: 'ja',
  PH: 'fil',
  KR: 'ko',
  BR: 'pt',
  PT: 'pt',
  DE: 'de',
  AT: 'de',
  CH: 'de',
  ID: 'id',
  MY: 'id',
  CZ: 'cs',
  SK: 'cs',
  FR: 'fr',
  BE: 'fr',
  // Spanish-speaking Americas + Spain
  MX: SPANISH, ES: SPANISH, AR: SPANISH, CO: SPANISH, CL: SPANISH, PE: SPANISH,
  VE: SPANISH, EC: SPANISH, GT: SPANISH, CU: SPANISH, BO: SPANISH, DO: SPANISH,
  HN: SPANISH, PY: SPANISH, SV: SPANISH, NI: SPANISH, CR: SPANISH, PA: SPANISH,
  UY: SPANISH, PR: SPANISH,
};

export function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (SUPPORTED_LOCALES as string[]).includes(value);
}

/**
 * Resolve a BCP-47 language tag (e.g. "ja", "pt-BR", "tl-PH") to a supported
 * locale, or null. Handles Tagalog's tl/fil split and pt/es regional variants
 * by matching on the primary subtag.
 */
export function matchLanguageTag(tag: string | null | undefined): Locale | null {
  if (!tag) return null;
  const primary = tag.toLowerCase().split('-')[0];
  if (primary === 'tl' || primary === 'fil') return 'fil';
  if (isLocale(primary)) return primary;
  return null;
}

/**
 * Pick the best supported locale from the browser's language preferences,
 * honoring their priority order (navigator.languages).
 */
export function matchNavigatorLocale(
  languages: readonly string[] | undefined
): Locale | null {
  if (!languages) return null;
  for (const tag of languages) {
    const hit = matchLanguageTag(tag);
    if (hit) return hit;
  }
  return null;
}

export function localeForCountry(country: string | null | undefined): Locale | null {
  if (!country) return null;
  return COUNTRY_TO_LOCALE[country.toUpperCase()] ?? null;
}
