import Head from 'next/head';
import * as React from 'react';

import { DEFAULT_LOCALE, OG_LOCALES, SUPPORTED_LOCALES, type Locale } from '../../lib/i18n/config';
import { jsonLdString } from '../../lib/jsonLd';

interface WhatsNewHeadProps {
  locale: Locale;
  title: string;
  description: string;
  urlFor: (locale: Locale) => string;
  ogType: 'website' | 'article';
  image: { url: string; width: number; height: number };
  jsonLd: object[];
}

const WhatsNewHead = ({
  locale,
  title,
  description,
  urlFor,
  ogType,
  image,
  jsonLd,
}: WhatsNewHeadProps): React.ReactElement => {
  const url = urlFor(locale);
  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />

      {/* next/head dedupes by key: hreflang links and og:locale:alternate metas
          need distinct key prefixes or they collapse into one. */}
      {SUPPORTED_LOCALES.map((l) => (
        <link key={`hreflang-${l}`} rel="alternate" hrefLang={l} href={urlFor(l)} />
      ))}
      <link
        key="hreflang-x-default"
        rel="alternate"
        hrefLang="x-default"
        href={urlFor(DEFAULT_LOCALE)}
      />

      <meta property="og:type" content={ogType} />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:site_name" content="KaraoQ" />
      <meta property="og:locale" content={OG_LOCALES[locale]} />
      {SUPPORTED_LOCALES.filter((l) => l !== locale).map((l) => (
        <meta key={`og-${l}`} property="og:locale:alternate" content={OG_LOCALES[l]} />
      ))}
      <meta property="og:image" content={image.url} />
      <meta property="og:image:width" content={String(image.width)} />
      <meta property="og:image:height" content={String(image.height)} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image.url} />

      {jsonLd.map((block, i) => (
        <script
          key={`ld-${i}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdString(block) }}
        />
      ))}
    </Head>
  );
};

export default WhatsNewHead;
