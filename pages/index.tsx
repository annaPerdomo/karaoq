import * as fs from 'fs';
import * as path from 'path';
import type { GetStaticProps, NextPage } from 'next';
import Head from 'next/head';

import Home, { FAQ_ITEMS } from '../components/Home';
import { useT } from '../lib/i18n/I18nProvider';
import {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  OG_LOCALES,
  SITE_URL,
  localeUrl,
  isLocale,
  type Locale,
} from '../lib/i18n/config';
import type { Catalog } from '../lib/i18n/messages';

interface HomePageProps {
  /** Locale this page was rendered for (the route's locale). */
  pageLocale: Locale;
}

const OG_IMAGE = `${SITE_URL}/og-image.png`;

const HomePage: NextPage<HomePageProps> = ({ pageLocale }) => {
  const { t } = useT();
  const loc = isLocale(pageLocale) ? pageLocale : DEFAULT_LOCALE;
  const isEn = loc === DEFAULT_LOCALE;
  const url = localeUrl(loc);

  // English keeps its hand-tuned, keyword-rich meta; other languages derive
  // theirs from the already-translated hero copy (professional, zero new work).
  const title = isEn
    ? 'KaraoQ — YouTube Karaoke App | No Downloads, No Sign-Up'
    : `KaraoQ — ${t('home.hero.title')}`;
  const ogTitle = isEn ? 'KaraoQ — YouTube Karaoke App' : `KaraoQ — ${t('home.hero.title')}`;
  const description = isEn
    ? 'Turn any gathering into karaoke night with KaraoQ. Search YouTube for songs, build a shared queue from your phone, and sing with friends. No downloads, works on any device.'
    : t('home.hero.sub');
  const twitterDescription = isEn
    ? 'Turn any gathering into karaoke night. Search YouTube, build a queue from your phone, cheer on your friends, and sing.'
    : t('home.hero.sub');

  // JSON-LD built from the same translated strings the page shows, so the
  // structured data matches the visible content in every language.
  const featureList = [1, 2, 3, 4, 5, 6].map((n) => t(`home.feature${n}.title`));

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        {isEn && (
          <meta
            name="keywords"
            content="karaoke app, YouTube karaoke, online karaoke, karaoke with friends, karaoke queue, karaoke night, karaoke party, sing karaoke online, live reactions"
          />
        )}
        <link rel="canonical" href={url} />

        {/* hreflang: connect every language version + x-default → English.
            Keys are prefixed so they don't collide with the og:locale:alternate
            metas below — next/head dedupes head children by their `key`. */}
        {SUPPORTED_LOCALES.map((l) => (
          <link key={`hreflang-${l}`} rel="alternate" hrefLang={l} href={localeUrl(l)} />
        ))}
        <link key="hreflang-x-default" rel="alternate" hrefLang="x-default" href={localeUrl(DEFAULT_LOCALE)} />

        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content={url} />
        <meta property="og:title" content={ogTitle} />
        <meta property="og:description" content={description} />
        <meta property="og:site_name" content="KaraoQ" />
        <meta property="og:locale" content={OG_LOCALES[loc]} />
        {SUPPORTED_LOCALES.filter((l) => l !== loc).map((l) => (
          <meta key={`og-${l}`} property="og:locale:alternate" content={OG_LOCALES[l]} />
        ))}
        <meta property="og:image" content={OG_IMAGE} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta
          property="og:image:alt"
          content="KaraoQ — YouTube karaoke, zero setup. A TV showing the karaoke queue and lyrics, with phones adding songs and cheering."
        />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={ogTitle} />
        <meta name="twitter:description" content={twitterDescription} />
        <meta name="twitter:image" content={OG_IMAGE} />
        <meta
          name="twitter:image:alt"
          content="KaraoQ — YouTube karaoke, zero setup. A TV showing the karaoke queue and lyrics, with phones adding songs and cheering."
        />

        {/* JSON-LD Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebApplication',
              name: 'KaraoQ',
              url,
              inLanguage: loc,
              description,
              applicationCategory: 'EntertainmentApplication',
              operatingSystem: 'Any',
              featureList,
            }),
          }}
        />

        {/* JSON-LD FAQ — mirrors the visible (translated) FAQ section */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              inLanguage: loc,
              mainEntity: FAQ_ITEMS.map((item) => ({
                '@type': 'Question',
                name: t(`faq.${item.id}.q`),
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: t(`faq.${item.id}.a`),
                },
              })),
            }),
          }}
        />
      </Head>
      <Home />
    </>
  );
};

// One page, generated once per locale by Next's i18n routing. For non-English
// locales we ship the matching catalog so the provider renders localized HTML
// on the server (crawlable, no flash); English uses the bundled catalog.
export const getStaticProps: GetStaticProps<
  HomePageProps & { i18nLocale: Locale | null; i18nCatalog: Catalog | null }
> = async ({ locale }) => {
  const pageLocale: Locale = isLocale(locale) ? locale : DEFAULT_LOCALE;
  let i18nCatalog: Catalog | null = null;
  if (pageLocale !== DEFAULT_LOCALE) {
    const file = path.join(process.cwd(), 'public', 'i18n', `${pageLocale}.json`);
    i18nCatalog = JSON.parse(fs.readFileSync(file, 'utf8')) as Catalog;
  }
  return {
    props: {
      pageLocale,
      i18nLocale: pageLocale === DEFAULT_LOCALE ? null : pageLocale,
      i18nCatalog,
    },
  };
};

export default HomePage;
