import { Locale, DEFAULT_LOCALE, isLocale } from './config';

/**
 * How the visitor ended up in the locale they're seeing. Distinguishes a
 * deliberate pick from a guess, which is the difference between "people want
 * this language" and "we assumed this language" when reading the analytics.
 */
export type LocaleSource =
  /** Picked from the language switcher this session. */
  | 'switch'
  /** A switcher pick from a previous visit, restored from localStorage. */
  | 'stored'
  /** ?lang= in the URL. */
  | 'url'
  /** Matched navigator.languages — their device language. */
  | 'browser'
  /** Guessed from the visitor's country because nothing else matched. */
  | 'geo'
  /** A server-localized landing route (/ja, /cs, …) rendered in that locale. */
  | 'route'
  /** No signal at all, so English. */
  | 'default';

/**
 * Header clients tag requests with to report the UI language they're rendering
 * in. Lives here rather than in lib/analytics so client bundles can name it
 * without importing the server-only analytics module.
 */
export const LOCALE_HEADER = 'x-karaoq-locale';

/** The three sources that represent a deliberate human choice of language. */
export const CHOSEN_LOCALE_SOURCES: LocaleSource[] = ['switch', 'stored', 'url'];

// Mirror of the I18nProvider's locale for non-React callers — chiefly the
// session heartbeat, which fires from a plain module on a timer and must report
// whatever language the UI is in *right now*, including after a mid-room
// switch. Kept in sync by applyLocale; never written from anywhere else.
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
