import { Locale, DEFAULT_LOCALE, isLocale } from './config';

/** How the visitor got this locale. 'switch' = switcher pick this session; 'stored' = a prior pick
 * restored from localStorage; 'route' = a server-localized landing route (/ja, /cs, …). */
export type LocaleSource =
  | 'switch'
  | 'stored'
  | 'url'
  | 'browser'
  | 'geo'
  | 'route'
  | 'default';

/** Lives here rather than lib/analytics so client bundles can name it without importing the server-only module. */
export const LOCALE_HEADER = 'x-karaoq-locale';

/** The three sources that represent a deliberate human choice of language. */
export const CHOSEN_LOCALE_SOURCES: LocaleSource[] = ['switch', 'stored', 'url'];

// Mirror of the I18nProvider's locale for non-React callers (the session heartbeat's timer).
// Kept in sync by applyLocale; never written from anywhere else.
let activeLocale: Locale = DEFAULT_LOCALE;
let activeSource: LocaleSource = 'default';

export function setActiveLocale(locale: Locale, source: LocaleSource): void {
  activeLocale = locale;
  activeSource = source;
}

export function getActiveLocale(): { locale: Locale; source: LocaleSource } {
  return { locale: activeLocale, source: activeSource };
}

export function isLocaleSource(value: unknown): value is LocaleSource {
  return (
    typeof value === 'string' &&
    ['switch', 'stored', 'url', 'browser', 'geo', 'route', 'default'].includes(
      value
    )
  );
}

/** Narrow an untrusted value (request body/header) to a supported locale. */
export function asLocale(value: unknown): Locale | null {
  return typeof value === 'string' && isLocale(value) ? value : null;
}
