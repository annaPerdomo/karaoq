import * as fs from 'fs';
import * as path from 'path';
import type { GetStaticProps, NextPage } from 'next';
import Head from 'next/head';

import SongChartPage from '../../components/songs/SongChartPage';
import { useT } from '../../lib/i18n/I18nProvider';
import {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  OG_LOCALES,
  SITE_URL,
  isLocale,
  type Locale,
} from '../../lib/i18n/config';
import type { Catalog } from '../../lib/i18n/messages';
import { jsonLdString } from '../../lib/jsonLd';
import { songsUrl, type ChartSong } from '../../lib/songCharts';
import { countriesWithCharts, readTopSongs } from '../../lib/songChartsServer';

interface SongsPageProps {
  pageLocale: Locale;
  songs: ChartSong[];
  updatedAt: string;
  countries: string[];
}

const OG_IMAGE = `${SITE_URL}/og-image.png`;

const SongsPage: NextPage<SongsPageProps> = ({ pageLocale, songs, updatedAt, countries }) => {
  const { t } = useT();
  const loc = isLocale(pageLocale) ? pageLocale : DEFAULT_LOCALE;
  const url = songsUrl(loc);
  const isEmpty = songs.length === 0;

  const title = t('songs.title');
  const description = t('songs.metaDesc');

  const itemList = !isEmpty
    ? {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: title,
        itemListElement: songs.map((song, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: `${song.title} — ${song.artist}`,
        })),
      }
    : null;

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'KaraoQ', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: title, item: url },
    ],
  };

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={url} />
        {isEmpty && <meta name="robots" content="noindex" />}

        {SUPPORTED_LOCALES.map((l) => (
          <link key={`hreflang-${l}`} rel="alternate" hrefLang={l} href={songsUrl(l)} />
        ))}
        <link
          key="hreflang-x-default"
          rel="alternate"
          hrefLang="x-default"
          href={songsUrl(DEFAULT_LOCALE)}
        />

        <meta property="og:type" content="website" />
        <meta property="og:url" content={url} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:site_name" content="KaraoQ" />
        <meta property="og:locale" content={OG_LOCALES[loc]} />
        {SUPPORTED_LOCALES.filter((l) => l !== loc).map((l) => (
          <meta key={`og-${l}`} property="og:locale:alternate" content={OG_LOCALES[l]} />
        ))}
        <meta property="og:image" content={OG_IMAGE} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={OG_IMAGE} />

        {itemList && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: jsonLdString(itemList) }}
          />
        )}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumb) }}
        />
      </Head>
      <SongChartPage songs={songs} updatedAt={updatedAt} countries={countries} />
    </>
  );
};

const CHART_REVALIDATE_SECONDS = 86400;
const CHART_RETRY_SECONDS = 300;
// Well under Next's 60s staticPageGenerationTimeout, even with every per-query
// maxTimeMS (lib/songChartsServer) hit in sequence inside one country's read.
const CHART_QUERY_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Song chart query timed out')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export const getStaticProps: GetStaticProps<
  SongsPageProps & { i18nLocale: Locale | null; i18nCatalog: Catalog | null }
> = async ({ locale }) => {
  const pageLocale: Locale = isLocale(locale) ? locale : DEFAULT_LOCALE;
  let i18nCatalog: Catalog | null = null;
  if (pageLocale !== DEFAULT_LOCALE) {
    const file = path.join(process.cwd(), 'public', 'i18n', `${pageLocale}.json`);
    i18nCatalog = JSON.parse(fs.readFileSync(file, 'utf8')) as Catalog;
  }

  let songs: ChartSong[];
  let countries: string[];
  let allCountriesOk = true;

  try {
    const [songsResult, countriesResult] = await withTimeout(
      Promise.all([readTopSongs({}), countriesWithCharts()]),
      CHART_QUERY_TIMEOUT_MS
    );
    songs = songsResult;
    countries = countriesResult.countries;
    allCountriesOk = countriesResult.allOk;
  } catch (err) {
    // Build time has no previous page for ISR to fall back to, so a DB
    // failure must still yield a page; at runtime, rethrow so ISR keeps
    // serving the last good one.
    if (process.env.NEXT_PHASE !== 'phase-production-build') throw err;
    songs = [];
    countries = [];
    allCountriesOk = false;
  }

  return {
    props: {
      pageLocale,
      songs,
      countries,
      updatedAt: new Date().toISOString(),
      i18nLocale: pageLocale === DEFAULT_LOCALE ? null : pageLocale,
      i18nCatalog,
    },
    revalidate:
      songs.length === 0 || !allCountriesOk ? CHART_RETRY_SECONDS : CHART_REVALIDATE_SECONDS,
  };
};

export default SongsPage;
