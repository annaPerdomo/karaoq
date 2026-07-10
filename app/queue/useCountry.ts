import * as React from 'react';

const STORAGE_KEY = 'karaoq_country';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Read the cached geo country, honoring the 7-day TTL. Shared with the i18n
 * provider so every consumer applies the same freshness rule — a stale guess
 * (someone home from a trip) must not keep picking the UI language.
 */
export function readCachedCountry(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as { country?: unknown; storedAt?: unknown };
    if (
      typeof cached.country === 'string' &&
      typeof cached.storedAt === 'number' &&
      Date.now() - cached.storedAt < MAX_AGE_MS
    ) {
      return cached.country;
    }
  } catch {}
  return null;
}

/**
 * Resolve the visitor's country code (ISO 3166-1 alpha-2, uppercase).
 *
 * Priority:
 * 1. `?country=XX` URL param — lets anyone preview another country's
 *    suggestion lists (and makes the modes testable without a VPN).
 * 2. localStorage cache (7 days) — avoids refetching /api/geo every visit.
 * 3. `/api/geo`, which echoes Vercel's x-vercel-ip-country header.
 *
 * Returns null until resolved, or when the country is unknown (e.g. local
 * dev), in which case callers fall back to the default section ordering.
 */
export default function useCountry(): string | null {
  const [country, setCountry] = React.useState<string | null>(null);

  React.useEffect(() => {
    const override = new URLSearchParams(window.location.search).get('country');
    if (override && /^[a-zA-Z]{2}$/.test(override)) {
      setCountry(override.toUpperCase());
      return;
    }

    const cached = readCachedCountry();
    if (cached) {
      setCountry(cached);
      return;
    }

    let cancelled = false;
    fetch('/api/geo')
      .then((res) => res.json())
      .then((data: { country: string | null }) => {
        if (cancelled || !data.country) return;
        setCountry(data.country);
        try {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ country: data.country, storedAt: Date.now() })
          );
        } catch {}
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return country;
}
