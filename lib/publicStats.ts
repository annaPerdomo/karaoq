// Pure helpers for the public landing-page stats. Kept free of Mongo /
// Next.js imports so they can be unit-tested directly.

export interface PublicStats {
  /** All-time songs added, rounded down — null when below its floor. */
  songs: number | null;
  /** All-time reactions sent, rounded down — null when below its floor. */
  cheers: number | null;
  /** Distinct countries seen across all events — null when below its floor. */
  countries: number | null;
  /** Every ISO country code seen, most active first — lights up the world map. */
  countryCodes: string[];
}

// Below these a figure undersells rather than impresses, so the page nulls it
// and the strip hides that item (or the whole strip) instead.
export const STAT_FLOORS = { songs: 100, cheers: 100, countries: 5 } as const;

// 1,384 → 1,300: round down to two significant digits so the public figure
// (shown as "1,300+") stays true no matter how the real count moves between
// cache refreshes, and never reads as a suspiciously precise claim.
export function roundDownNice(n: number): number {
  if (n < 100) return n;
  const magnitude = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.floor(n / magnitude) * magnitude;
}

export function shapeStats(raw: {
  songs: number;
  cheers: number;
  countryCodes: string[];
}): PublicStats {
  const countries = raw.countryCodes.length;
  return {
    songs: raw.songs >= STAT_FLOORS.songs ? roundDownNice(raw.songs) : null,
    cheers: raw.cheers >= STAT_FLOORS.cheers ? roundDownNice(raw.cheers) : null,
    // The distinct-country count is slow-moving and reads authentic exactly
    // as-is, so it isn't rounded.
    countries: countries >= STAT_FLOORS.countries ? countries : null,
    countryCodes: countries >= STAT_FLOORS.countries ? raw.countryCodes : [],
  };
}

export const EMPTY_STATS: PublicStats = {
  songs: null,
  cheers: null,
  countries: null,
  countryCodes: [],
};
