import * as fs from 'fs';
import * as path from 'path';

import { DEFAULT_LOCALE, isLocale, type Locale } from './config';
import type { Catalog } from './messages';

export interface LocaleStaticProps {
  pageLocale: Locale;
  i18nLocale: Locale | null;
  i18nCatalog: Catalog | null;
}

export function localeStaticProps(locale: string | undefined): LocaleStaticProps {
  const pageLocale: Locale = isLocale(locale) ? locale : DEFAULT_LOCALE;
  if (pageLocale === DEFAULT_LOCALE) {
    return { pageLocale, i18nLocale: null, i18nCatalog: null };
  }
  const file = path.join(process.cwd(), 'public', 'i18n', `${pageLocale}.json`);
  return {
    pageLocale,
    i18nLocale: pageLocale,
    i18nCatalog: JSON.parse(fs.readFileSync(file, 'utf8')) as Catalog,
  };
}
