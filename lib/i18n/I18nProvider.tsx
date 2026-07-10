import * as React from 'react';

import { en, Catalog } from './messages';
import {
  Locale,
  DEFAULT_LOCALE,
  isLocale,
  matchNavigatorLocale,
  localeForCountry,
} from './config';
import { readCachedCountry } from '../../app/queue/useCountry';

const STORAGE_KEY = 'karaoq_lang';

// Cache fetched catalogs for the session so switching back and forth never
// re-hits the network. English is bundled; the rest are CDN-cached JSON.
const catalogCache: Partial<Record<Locale, Catalog>> = { en };

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** Translate a key, interpolating {vars}. Falls back to English, then key. */
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** Plural-aware translate: resolves {key}.{Intl category} with .other fallback. */
  tn: (key: string, count: number, vars?: Record<string, string | number>) => string;
}

const I18nContext = React.createContext<I18nValue | null>(null);

function interpolate(
  template: string,
  vars?: Record<string, string | number>
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, name) =>
    name in vars ? String(vars[name]) : m
  );
}

/**
 * Resolve the visitor's UI locale from the fastest available signals, or null
 * if none of them tell us anything. Returning null (rather than English) lets
 * the caller tell "the browser is genuinely set to English" apart from "no
 * signal at all" — only the latter should fall through to a country guess, so a
 * visitor whose device is in English keeps English even abroad.
 */
/**
 * The two signals that represent an explicit user decision — the ?lang= URL
 * override and a stored pick from the language switcher. Unlike the browser
 * language or a geo guess, these must win even on a server-localized route.
 */
function readExplicitLocale(): Locale | null {
  if (typeof window === 'undefined') return null;
  try {
    const override = new URLSearchParams(window.location.search).get('lang');
    if (isLocale(override)) return override;
  } catch {}
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {}
  return null;
}

function readInitialLocale(): Locale | null {
  if (typeof window === 'undefined') return null;
  const explicit = readExplicitLocale();
  if (explicit) return explicit;
  // The device/browser language — the same preference that decides what
  // language they read other sites in. This wins over any location guess.
  const nav = matchNavigatorLocale(
    navigator.languages ?? (navigator.language ? [navigator.language] : [])
  );
  if (nav) return nav;
  // Cached geo country from a prior visit (useCountry writes this; the shared
  // reader applies its 7-day TTL so a stale guess can't pick the language).
  const geo = localeForCountry(readCachedCountry() ?? undefined);
  if (geo) return geo;
  return null;
}

async function loadCatalog(locale: Locale): Promise<Catalog> {
  if (catalogCache[locale]) return catalogCache[locale]!;
  try {
    const res = await fetch(`/i18n/${locale}.json`);
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as Catalog;
    catalogCache[locale] = data;
    return data;
  } catch {
    // Network/parse failure — fall back to English so the UI stays usable.
    return en;
  }
}

export function I18nProvider({
  children,
  initialLocale = null,
  initialCatalog = null,
}: {
  children: React.ReactNode;
  /**
   * Locale a page rendered on the server (a localized landing route). When set,
   * both SSR and the first client render use it — no detection, no flash, no
   * hydration drift — and the switcher can still change it afterward. Left null
   * on `/` and app pages, which fall back to client-side detection.
   */
  initialLocale?: Locale | null;
  /** The `initialLocale` catalog, shipped from getStaticProps so SSR is localized. */
  initialCatalog?: Catalog | null;
}): React.ReactElement {
  const seeded = !!initialLocale;
  // Register the server-provided catalog so a later re-visit is instant.
  if (initialLocale && initialCatalog) catalogCache[initialLocale] = initialCatalog;

  // A seeded page starts in its server locale (first client render must match
  // the localized SSR HTML); otherwise start from the default and detect below.
  const [locale, setLocaleState] = React.useState<Locale>(initialLocale ?? DEFAULT_LOCALE);
  const [catalog, setCatalog] = React.useState<Catalog>(
    (initialLocale && initialCatalog) || en
  );

  const applyLocale = React.useCallback((next: Locale) => {
    setLocaleState(next);
    if (typeof document !== 'undefined') document.documentElement.lang = next;
    if (next === 'en') {
      setCatalog(en);
      return;
    }
    loadCatalog(next).then((c) => {
      // Ignore a stale load if the locale changed again meanwhile.
      setLocaleState((cur) => {
        if (cur === next) setCatalog(c);
        return cur;
      });
    });
  }, []);

  // Resolve the visitor's locale after mount. A URL/stored/browser-language
  // signal wins outright (so an English device stays English anywhere). Only
  // when there's no such signal do we guess from the country via /api/geo —
  // that's what localizes a visitor whose browser language we don't support.
  // Skipped entirely when the page was server-rendered in a chosen locale.
  React.useEffect(() => {
    if (seeded) {
      if (typeof document !== 'undefined') document.documentElement.lang = initialLocale!;
      // A seeded (SEO) route renders in its server locale, but the visitor's
      // explicit choice — ?lang= or a stored switcher pick — still wins:
      // someone who landed on /cs and switched to English must not be Czech
      // again next visit. Applied post-mount so SSR and hydration both stay
      // in the server locale (no mismatch), same as the detection below.
      const explicit = readExplicitLocale();
      if (explicit && explicit !== initialLocale) applyLocale(explicit);
      return;
    }
    const resolved = readInitialLocale();
    if (resolved) {
      applyLocale(resolved);
      return;
    }
    // No explicit/browser signal — try geo once as a last resort.
    let cancelled = false;
    fetch('/api/geo')
      .then((r) => r.json())
      .then((d: { country: string | null }) => {
        if (cancelled) return;
        const geo = localeForCountry(d.country);
        if (geo) applyLocale(geo);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [applyLocale, seeded, initialLocale]);

  const setLocale = React.useCallback(
    (next: Locale) => {
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {}
      applyLocale(next);
    },
    [applyLocale]
  );

  const value = React.useMemo<I18nValue>(() => {
    const t = (key: string, vars?: Record<string, string | number>): string => {
      const template = catalog[key] ?? en[key as keyof typeof en] ?? key;
      return interpolate(template, vars);
    };
    const tn = (
      key: string,
      count: number,
      vars?: Record<string, string | number>
    ): string => {
      let category = 'other';
      try {
        category = new Intl.PluralRules(locale).select(count);
      } catch {}
      const withCount = { count, ...vars };
      const primary = `${key}.${category}`;
      if (catalog[primary] ?? en[primary as keyof typeof en]) {
        return t(primary, withCount);
      }
      return t(`${key}.other`, withCount);
    };
    return { locale, setLocale, t, tn };
  }, [catalog, locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): I18nValue {
  const ctx = React.useContext(I18nContext);
  if (!ctx) {
    // Defensive fallback so a component rendered outside the provider (tests,
    // storybook) still returns English instead of throwing.
    const t = (key: string, vars?: Record<string, string | number>) =>
      interpolate(en[key as keyof typeof en] ?? key, vars);
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      t,
      tn: (key, count, vars) => t(`${key}.other`, { count, ...vars }),
    };
  }
  return ctx;
}
