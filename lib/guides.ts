// ─── Guide/content pages ───────────────────────────────────────────────────
// Query-targeted articles that answer the specific questions people type into
// search engines and LLM assistants ("how to host karaoke at home", "karaoke
// on your TV", "free YouTube karaoke", "karaoke for a bar/venue"). Each guide
// is a crawlable, server-rendered, structured-data page in every supported
// locale — extra surface for search + generative engines to match and cite,
// built entirely from the same t()/catalog i18n system the rest of the app uses.
//
// Slugs are English and shared across locales; Next.js i18n prefixes the locale
// (`/guide/x`, `/es/guide/x`, …). Each guide has exactly STEP_COUNT how-to
// steps so the visible content and the HowTo JSON-LD stay in lockstep.

import { SITE_URL, localePath, type Locale } from './i18n/config';

/** Every guide has this many `stepN` items (drives HowTo schema + rendering). */
export const STEP_COUNT = 4;

export interface Guide {
  /** i18n namespace + React key. All copy lives under `guide.<id>.*`. */
  id: string;
  /** URL slug (English, identical across locales). */
  slug: string;
  /** Ids of sibling guides to cross-link at the foot of the article. */
  related: string[];
}

export const GUIDES: Guide[] = [
  {
    id: 'athome',
    slug: 'how-to-host-karaoke-at-home',
    related: ['tv', 'youtube', 'venue'],
  },
  {
    id: 'tv',
    slug: 'karaoke-on-your-tv',
    related: ['athome', 'youtube', 'venue'],
  },
  {
    id: 'youtube',
    slug: 'free-youtube-karaoke',
    related: ['athome', 'tv', 'venue'],
  },
  {
    id: 'venue',
    slug: 'karaoke-for-bars-and-venues',
    related: ['athome', 'tv', 'youtube'],
  },
];

export const GUIDE_SLUGS = GUIDES.map((g) => g.slug);

export function guideBySlug(slug: string | undefined): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}

export function guideById(id: string): Guide | undefined {
  return GUIDES.find((g) => g.id === id);
}

/** Absolute canonical URL for a guide in a given locale. */
export function guideUrl(slug: string, locale: Locale): string {
  return `${SITE_URL}${localePath(locale)}/guide/${slug}`;
}

/** Ordered `guide.<id>.stepN.*` key indices, e.g. [1,2,3,4]. */
export const STEP_INDICES = Array.from({ length: STEP_COUNT }, (_, i) => i + 1);
