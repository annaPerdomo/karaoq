import * as fs from 'fs';
import * as path from 'path';
import type { GetStaticPaths, GetStaticProps, NextPage } from 'next';
import Head from 'next/head';

import GuideArticle from '../../components/GuideArticle';
import { useT } from '../../lib/i18n/I18nProvider';
import {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  OG_LOCALES,
  SITE_URL,
  isLocale,
  type Locale,
} from '../../lib/i18n/config';
import { GUIDE_SLUGS, hasInlinePlacements, indices, guideBySlug, guideUrl } from '../../lib/guides';
import type { Catalog } from '../../lib/i18n/messages';

interface GuidePageProps {
  guideId: string;
  slug: string;
  pageLocale: Locale;
}

const OG_IMAGE = `${SITE_URL}/og-image.png`;

const GuidePage: NextPage<GuidePageProps> = ({ guideId, slug, pageLocale }) => {
  const { t } = useT();
  const loc = isLocale(pageLocale) ? pageLocale : DEFAULT_LOCALE;
  const url = guideUrl(slug, loc);

  const guide = guideBySlug(slug);

  const g = (suffix: string) => t(`guide.${guideId}.${suffix}`);
  const title = g('title');
  const description = g('metaDesc');

  // Each JSON-LD block exists only when the matching visible section does, and
  // both are sourced from the same guide.<id>.* keys so they can't drift.
  const howTo =
    guide && guide.stepCount > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'HowTo',
          name: g('h1'),
          description: g('intro'),
          inLanguage: loc,
          step: indices(guide.stepCount).map((n) => ({
            '@type': 'HowToStep',
            position: n,
            name: g(`step${n}.title`),
            text: g(`step${n}.body`),
            url: `${url}#step-${n}`,
          })),
          totalTime: 'PT5M',
        }
      : null;

  const faq =
    guide && guide.faqCount > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          inLanguage: loc,
          mainEntity: indices(guide.faqCount).map((n) => ({
            '@type': 'Question',
            name: g(`faq${n}.q`),
            acceptedAnswer: { '@type': 'Answer', text: g(`faq${n}.a`) },
          })),
        }
      : null;

  // External URLs go in untagged — affiliate params don't belong in schema.
  const itemList =
    guide && (guide.items?.length ?? 0) > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          // Schema names must appear on the page: with everything placed inline
          // the foot list's heading never renders, so use the inline one.
          name: hasInlinePlacements(guide) ? t('guide.buyHeading') : g('itemsHeading'),
          itemListElement: (guide.items ?? []).map((item, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: g(`item${i + 1}.name`),
            url: item.href,
          })),
        }
      : null;

  const article = guide
    ? {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: g('h1'),
        description,
        inLanguage: loc,
        mainEntityOfPage: url,
        datePublished: guide.published,
        dateModified: guide.updated,
        image: OG_IMAGE,
        author: { '@type': 'Organization', name: 'KaraoQ', url: `${SITE_URL}/` },
        publisher: { '@type': 'Organization', name: 'KaraoQ', url: `${SITE_URL}/` },
      }
    : null;

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'KaraoQ', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: g('h1'), item: url },
    ],
  };

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={url} />

        {/* hreflang: every locale's version of THIS guide + x-default → English. */}
        {SUPPORTED_LOCALES.map((l) => (
          <link key={`hreflang-${l}`} rel="alternate" hrefLang={l} href={guideUrl(slug, l)} />
        ))}
        <link
          key="hreflang-x-default"
          rel="alternate"
          hrefLang="x-default"
          href={guideUrl(slug, DEFAULT_LOCALE)}
        />

        {/* Open Graph */}
        <meta property="og:type" content="article" />
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

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={OG_IMAGE} />

        {/* JSON-LD: HowTo / FAQPage / ItemList (whichever sections the guide
            has) + Breadcrumb, all mirroring the visible, translated copy so
            structured data matches the page. */}
        {article && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(article) }}
          />
        )}
        {howTo && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(howTo) }}
          />
        )}
        {faq && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(faq) }}
          />
        )}
        {itemList && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }}
          />
        )}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
        />
      </Head>
      <GuideArticle guideId={guideId} />
    </>
  );
};

// One static page per guide slug × locale. A dynamic getStaticPaths must
// enumerate locales explicitly — unlike the static landing route, Next won't
// fan a dynamic route across locales on its own, so we pre-render every
// `/{locale}/guide/{slug}` here (or the hreflang targets 404 under fallback:false).
export const getStaticPaths: GetStaticPaths = async () => ({
  paths: GUIDE_SLUGS.flatMap((slug) =>
    SUPPORTED_LOCALES.map((locale) => ({ params: { slug }, locale }))
  ),
  fallback: false,
});

export const getStaticProps: GetStaticProps<
  GuidePageProps & { i18nLocale: Locale | null; i18nCatalog: Catalog | null }
> = async ({ params, locale }) => {
  const slug = String(params?.slug ?? '');
  const guide = guideBySlug(slug);
  if (!guide) return { notFound: true };

  const pageLocale: Locale = isLocale(locale) ? locale : DEFAULT_LOCALE;
  let i18nCatalog: Catalog | null = null;
  if (pageLocale !== DEFAULT_LOCALE) {
    const file = path.join(process.cwd(), 'public', 'i18n', `${pageLocale}.json`);
    i18nCatalog = JSON.parse(fs.readFileSync(file, 'utf8')) as Catalog;
  }

  return {
    props: {
      guideId: guide.id,
      slug,
      pageLocale,
      i18nLocale: pageLocale === DEFAULT_LOCALE ? null : pageLocale,
      i18nCatalog,
    },
  };
};

export default GuidePage;
