import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import en from "../../lib/i18n/en.json";
import {
  SUPPORTED_LOCALES,
  LOCALE_LABELS,
  COUNTRY_TO_LOCALE,
  matchLanguageTag,
  matchNavigatorLocale,
  localeForCountry,
  isLocale,
  DEFAULT_LOCALE,
} from "../../lib/i18n/config";

const I18N_DIR = path.join(__dirname, "../../public/i18n");
const EN_KEYS = Object.keys(en as Record<string, string>);

// Non-English locales ship as JSON catalogs under /public/i18n.
const JSON_LOCALES = SUPPORTED_LOCALES.filter((l) => l !== "en");

function loadCatalog(locale: string): Record<string, string> {
  const raw = fs.readFileSync(path.join(I18N_DIR, `${locale}.json`), "utf8");
  return JSON.parse(raw);
}

// Placeholder tokens like {name}/{code} MUST survive translation — a dropped
// token means the UI renders a literal "{code}" or loses interpolated data.
function tokensOf(value: string): string[] {
  return (value.match(/\{\w+\}/g) ?? []).sort();
}

describe("i18n config", () => {
  it("en is the default and is not shipped as a fetched catalog", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    expect(SUPPORTED_LOCALES).toContain("en");
  });

  it("every supported locale has a native label", () => {
    for (const loc of SUPPORTED_LOCALES) {
      expect(LOCALE_LABELS[loc], loc).toBeTruthy();
    }
  });

  it("every COUNTRY_TO_LOCALE target is a supported locale", () => {
    for (const [country, loc] of Object.entries(COUNTRY_TO_LOCALE)) {
      expect(country).toMatch(/^[A-Z]{2}$/);
      expect(SUPPORTED_LOCALES, `${country} -> ${loc}`).toContain(loc);
    }
  });

  it("resolves language tags to supported locales", () => {
    expect(matchLanguageTag("ja")).toBe("ja");
    expect(matchLanguageTag("pt-BR")).toBe("pt");
    expect(matchLanguageTag("es-MX")).toBe("es");
    expect(matchLanguageTag("tl")).toBe("fil"); // Tagalog → Filipino
    expect(matchLanguageTag("fil-PH")).toBe("fil");
    expect(matchLanguageTag("xx")).toBeNull();
    expect(matchLanguageTag(null)).toBeNull();
  });

  it("picks the first supported language from navigator preferences", () => {
    expect(matchNavigatorLocale(["zz", "de-AT", "en"])).toBe("de");
    expect(matchNavigatorLocale(["zz"])).toBeNull();
  });

  it("maps karaoke-heavy countries to their language", () => {
    expect(localeForCountry("JP")).toBe("ja");
    expect(localeForCountry("PH")).toBe("fil");
    expect(localeForCountry("kr")).toBe("ko"); // case-insensitive
    expect(localeForCountry("US")).toBeNull();
  });

  it("isLocale guards unknown values", () => {
    expect(isLocale("ja")).toBe(true);
    expect(isLocale("xx")).toBe(false);
    expect(isLocale(null)).toBe(false);
  });
});

describe("locale catalogs", () => {
  it.each(JSON_LOCALES)("%s.json exists and is valid JSON", (locale) => {
    expect(() => loadCatalog(locale), locale).not.toThrow();
  });

  it.each(JSON_LOCALES)("%s only uses keys that exist in en.json", (locale) => {
    const catalog = loadCatalog(locale);
    const unknown = Object.keys(catalog).filter((k) => !(k in en));
    expect(unknown, `${locale} has unknown keys: ${unknown.join(", ")}`).toEqual([]);
  });

  it.each(JSON_LOCALES)("%s translates every English key", (locale) => {
    const catalog = loadCatalog(locale);
    const missing = EN_KEYS.filter((k) => !(k in catalog));
    expect(missing, `${locale} missing keys: ${missing.join(", ")}`).toEqual([]);
  });

  it.each(JSON_LOCALES)(
    "%s preserves every placeholder token per key",
    (locale) => {
      const catalog = loadCatalog(locale);
      const mismatches: string[] = [];
      for (const key of EN_KEYS) {
        const value = catalog[key];
        if (typeof value !== "string") continue;
        const expected = tokensOf((en as Record<string, string>)[key]);
        const actual = tokensOf(value);
        if (expected.join(",") !== actual.join(",")) {
          mismatches.push(`${key} (expected ${expected}, got ${actual})`);
        }
      }
      expect(mismatches, `${locale} placeholder drift: ${mismatches.join("; ")}`).toEqual([]);
    }
  );

  it.each(JSON_LOCALES)(
    "%s keeps the ♥ marker in footer.credit",
    (locale) => {
      const catalog = loadCatalog(locale);
      expect(catalog["footer.credit"], locale).toContain("♥");
    }
  );
});
