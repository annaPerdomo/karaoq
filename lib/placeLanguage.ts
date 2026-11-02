import { localeForCountry } from "./i18n/config";

// Browser-safe: the shelves (lib/shelves) and the song-ideas place picker read
// a country's language the same way.

/** Countries whose language has no UI locale (lib/i18n/config maps the rest). */
const OVERRIDE: Record<string, string> = { tw: "zh", th: "th", in: "hi" };

export function placeLanguage(country: string): string {
  const cc = country.toLowerCase();
  return OVERRIDE[cc] ?? localeForCountry(cc) ?? "en";
}
