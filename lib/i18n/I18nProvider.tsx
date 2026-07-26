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
import { setActiveLocale, LocaleSource } from './activeLocale';

const STORAGE_KEY = 'karaoq_lang';

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

type Resolved = { locale: Locale; source: LocaleSource };

// The two signals that are an explicit user decision — unlike browser/geo, they win even on a server-localized route.
function readExplicitLocale(): Resolved | null {
  if (typeof window === 'undefined') return null;
  try {
    const override = new URLSearchParams(window.location.search).get('lang');
    if (isLocale(override)) return { locale: override, source: 'url' };
  } catch {}
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return { locale: stored, source: 'stored' };
  } catch {}
  return null;
}

// Returns null (not English) when there is no signal at all — only that case may fall through to a country guess.
function readInitialLocale(): Resolved | null {
  if (typeof window === 'undefined') return null;
  const explicit = readExplicitLocale();
  if (explicit) return explicit;
  const nav = matchNavigatorLocale(
    navigator.languages ?? (navigator.language ? [navigator.language] : [])
  );
  if (nav) return { locale: nav, source: 'browser' };
  // useCountry writes this cache; the shared reader applies its 7-day TTL.
  const geo = localeForCountry(readCachedCountry() ?? undefined);
  if (geo) return { locale: geo, source: 'geo' };
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
    return en;
  }
}

export function I18nProvider({
  children,
  initialLocale = null,
  initialCatalog = null,
}: {
  children: React.ReactNode;
  /** Locale a server-localized route rendered in: SSR and the first client render both use it (no
   * detection, no hydration drift). Null on `/` and app pages, which detect client-side. */
  initialLocale?: Locale | null;
  /** The `initialLocale` catalog, shipped from getStaticProps so SSR is localized. */
  initialCatalog?: Catalog | null;
}): React.ReactElement {
  const seeded = !!initialLocale;
  if (initialLocale && initialCatalog) catalogCache[initialLocale] = initialCatalog;

  // A seeded page must start in its server locale so the first client render matches the SSR HTML.
  const [locale, setLocaleState] = React.useState<Locale>(initialLocale ?? DEFAULT_LOCALE);
  const [catalog, setCatalog] = React.useState<Catalog>(
    (initialLocale && initialCatalog) || en
  );

  // Seed the analytics mirror during render, not in the effect below: children's mount effects (room
  // creation) run first. Module-var only, so render output is unaffected; skipped on the server, whose module state is shared.
  const mirrorSeeded = React.useRef(false);
  if (typeof window !== 'undefined' && !mirrorSeeded.current) {
    mirrorSeeded.current = true;
    if (initialLocale) setActiveLocale(initialLocale, 'route');
    else {
      const early = readInitialLocale();
      if (early) setActiveLocale(early.locale, early.source);
    }
  }

  const applyLocale = React.useCallback((next: Locale, source: LocaleSource) => {
    setLocaleState(next);
    // Keep the module mirror in step so session heartbeats report the on-screen language.
    setActiveLocale(next, source);
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

  // Post-mount detection: URL/stored/browser signal wins outright; only with no signal at all do we
  // guess from the country via /api/geo. Skipped when the page was server-rendered in a chosen locale.
  React.useEffect(() => {
    if (seeded) {
      if (typeof document !== 'undefined') document.documentElement.lang = initialLocale!;
      setActiveLocale(initialLocale!, 'route');
      // An explicit ?lang=/stored pick still beats the route locale. Applied post-mount so SSR and
      // hydration both stay in the server locale (no mismatch).
      const explicit = readExplicitLocale();
      if (explicit && explicit.locale !== initialLocale) {
        applyLocale(explicit.locale, explicit.source);
      } else if (explicit) {
        // Same locale the route renders, but report the deliberate source; skip the needless catalog reload.
        setActiveLocale(explicit.locale, explicit.source);
      }
      return;
    }
    const resolved = readInitialLocale();
    if (resolved) {
      applyLocale(resolved.locale, resolved.source);
      return;
    }
    let cancelled = false;
    fetch('/api/geo')
      .then((r) => r.json())
      .then((d: { country: string | null }) => {
        if (cancelled) return;
        const geo = localeForCountry(d.country);
        if (geo) applyLocale(geo, 'geo');
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
      applyLocale(next, 'switch');
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
    // Outside the provider (tests, storybook) fall back to English instead of throwing.
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
