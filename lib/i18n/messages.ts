// English base catalog — the single source of truth for UI copy and the
// fallback for every other locale. The catalog itself lives in en.json so the
// exact same key/value shape can be handed to translators and validated by
// tests. Other locales live as JSON under /public/i18n/{locale}.json with the
// SAME keys; any key a locale omits falls back to the English string here (see
// I18nProvider). Keep keys flat + dotted.
//
// Plural keys use an Intl.PluralRules category suffix (.one/.other/.few/…);
// look them up with the `tn` helper from useT().

import enJson from './en.json';

export type Catalog = Record<string, string>;

export const en: Catalog = enJson as Catalog;

export type MessageKey = keyof typeof enJson;
