import { SITE_URL, type Locale } from './i18n/config';
import {
  RELEASES,
  highlightIndices,
  leadMedia,
  mediaStill,
  releaseUrl,
  whatsNewUrl,
  type Release,
  type ReleaseMedia,
} from './releases';

type T = (key: string) => string;

export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;

const ORG = { '@type': 'Organization', name: 'KaraoQ', url: `${SITE_URL}/` };

const absolute = (publicPath: string) => `${SITE_URL}${publicPath}`;

export interface ShareImage {
  url: string;
  width: number;
  height: number;
}

const DEFAULT_SHARE: ShareImage = { url: DEFAULT_OG_IMAGE, width: 1200, height: 630 };

// Link previews crop portrait images badly and some crawlers skip WebP, so only a
// landscape lead clip gets a share image: a 1200x630 JPEG beside its poster.
export function releaseShareImage(release: Release): ShareImage {
  const media = leadMedia(release);
  if (!media || media.height > media.width) return DEFAULT_SHARE;
  return { url: absolute(shareImagePath(media)), width: 1200, height: 630 };
}

export function shareImagePath(media: ReleaseMedia): string {
  return mediaStill(media).replace(/\.\w+$/, '-og.jpg');
}

export function releaseImage(release: Release): string {
  return releaseShareImage(release).url;
}

export function releasePostingSchema(release: Release, locale: Locale, t: T) {
  const r = (suffix: string) => t(`release.${release.id}.${suffix}`);
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: r('h1'),
    description: r('metaDesc'),
    inLanguage: locale,
    mainEntityOfPage: releaseUrl(release.slug, locale),
    datePublished: release.date,
    dateModified: release.date,
    image: releaseImage(release),
    author: ORG,
    publisher: ORG,
    isPartOf: { '@type': 'Blog', name: t('whatsNew.h1'), url: whatsNewUrl(locale) },
  };
}

export function releaseVideoSchemas(release: Release, locale: Locale, t: T) {
  return highlightIndices(release).flatMap((n) => {
    const media = release.media?.[n];
    if (media?.kind !== 'video') return [];
    return [
      {
        '@context': 'https://schema.org',
        '@type': 'VideoObject',
        name: t(`release.${release.id}.hl${n}.title`),
        description: t(`release.${release.id}.hl${n}.body`),
        inLanguage: locale,
        thumbnailUrl: absolute(media.poster),
        contentUrl: absolute(media.mp4),
        uploadDate: release.date,
        duration: `PT${Math.round(media.seconds)}S`,
        embedUrl: `${releaseUrl(release.slug, locale)}#highlight-${n}`,
      },
    ];
  });
}

export function whatsNewBlogSchema(locale: Locale, t: T) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: t('whatsNew.h1'),
    description: t('whatsNew.metaDesc'),
    url: whatsNewUrl(locale),
    inLanguage: locale,
    publisher: ORG,
    blogPost: RELEASES.map((release) => ({
      '@type': 'BlogPosting',
      headline: t(`release.${release.id}.h1`),
      url: releaseUrl(release.slug, locale),
      datePublished: release.date,
    })),
  };
}

export function whatsNewBreadcrumb(locale: Locale, t: T, release?: Release) {
  const items = [
    { '@type': 'ListItem', position: 1, name: 'KaraoQ', item: `${SITE_URL}/` },
    { '@type': 'ListItem', position: 2, name: t('whatsNew.h1'), item: whatsNewUrl(locale) },
  ];
  if (release) {
    items.push({
      '@type': 'ListItem',
      position: 3,
      name: t(`release.${release.id}.h1`),
      item: releaseUrl(release.slug, locale),
    });
  }
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items };
}
