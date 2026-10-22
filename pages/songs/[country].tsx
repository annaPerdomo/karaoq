import * as fs from 'fs';
import * as path from 'path';
import type { GetStaticPaths, GetStaticProps, NextPage } from 'next';
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
import { CHART_MIN_SONGS, songsCountryUrl, songsUrl, type ChartSong } from '../../lib/songCharts';
import { readTopSongs, SONG_CHART_COUNTRIES } from '../../lib/songChartsServer';

interface SongsCountryPageProps {
  pageLocale: Locale;
  country: string;
  songs: ChartSong[];
  updatedAt: string;
}

const OG_IMAGE = `${SITE_URL}/og-image.png`;

const SongsCountryPage: NextPage<SongsCountryPageProps> = ({
  pageLocale,
  country,
  songs,
  updatedAt,
}) => {
  const { t, locale: uiLocale } = useT();
  const loc = isLocale(pageLocale) ? pageLocale : DEFAULT_LOCALE;
  const url = songsCountryUrl(country, loc);
  const countryName = new Intl.DisplayNames([uiLocale], { type: 'region' }).of(
    country.toUpperCase()
  ) ?? country;

  const title = t('songs.country.title', { country: countryName });
  const description = t('songs.country.metaDesc', { country: countryName });

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: title,
    itemListElement: songs.map((song, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: `${song.title} — ${song.artist}`,
    })),
  };

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'KaraoQ', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: t('songs.title'), item: songsUrl(loc) },
      { '@type': 'ListItem', position: 3, name: title, item: url },
    ],
  };

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={url} />

        {SUPPORTED_LOCALES.map((l) => (
          <link
            key={`hreflang-${l}`}
            rel="alternate"
            hrefLang={l}
            href={songsCountryUrl(country, l)}
          />
        ))}
        <link
          key="hreflang-x-default"
          rel="alternate"
          hrefLang="x-default"
          href={songsCountryUrl(country, DEFAULT_LOCALE)}
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

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdString(itemList) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumb) }}
        />
      </Head>
      <SongChartPage songs={songs} country={country} countryName={countryName} updatedAt={updatedAt} />
    </>
  );
};

const CHART_REVALIDATE_SECONDS = 86400;

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: [],
  fallback: 'blocking',
});

export const getStaticProps: GetStaticProps<
  SongsCountryPageProps & { i18nLocale: Locale | null; i18nCatalog: Catalog | null }
> = async ({ params, locale }) => {
  const rawCountry = String(params?.country ?? '');
  const country = rawCountry.toLowerCase();
  if (rawCountry !== country || !SONG_CHART_COUNTRIES.includes(country)) {
    return { notFound: true, revalidate: CHART_REVALIDATE_SECONDS };
  }

  // The exact call countriesWithCharts makes, so a country it links here
  // from the global page always clears this same check.
  const songs = await readTopSongs({ country });
  if (songs.length < CHART_MIN_SONGS) {
    return { notFound: true, revalidate: CHART_REVALIDATE_SECONDS };
  }

  const pageLocale: Locale = isLocale(locale) ? locale : DEFAULT_LOCALE;
  let i18nCatalog: Catalog | null = null;
  if (pageLocale !== DEFAULT_LOCALE) {
    const file = path.join(process.cwd(), 'public', 'i18n', `${pageLocale}.json`);
    i18nCatalog = JSON.parse(fs.readFileSync(file, 'utf8')) as Catalog;
  }

  return {
    props: {
      pageLocale,
      country,
      songs,
      updatedAt: new Date().toISOString(),
      i18nLocale: pageLocale === DEFAULT_LOCALE ? null : pageLocale,
      i18nCatalog,
    },
    revalidate: CHART_REVALIDATE_SECONDS,
  };
};

export default SongsCountryPage;
