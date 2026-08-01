// Guide/content pages: query-targeted articles answering questions people type
// into search engines and LLM assistants ("how to host karaoke at home", etc.).
// Each is a crawlable, server-rendered, structured-data page in every supported
// locale, built from the same t()/catalog i18n system as the rest of the app.
//
// Slugs are English and shared across locales; Next.js i18n prefixes the locale
// (`/guide/x`, `/es/guide/x`, …). Guides are assembled from optional sections —
// numbered how-to steps, an external-link list (gear picks, channels), and an
// FAQ — and each section's count here drives both the visible content and the
// matching JSON-LD (HowTo / ItemList / FAQPage) so the two stay in lockstep.

import { SITE_URL, localePath, type Locale } from './i18n/config';

/**
 * Amazon Associates tracking ID. Empty until the Associates account is
 * approved — links render without a tag (the affiliate disclosure follows
 * `sponsored`, not the tag, so copy doesn't change when this is set).
 * Note: tags are per-marketplace; this one is for amazon.com only.
 */
export const AMAZON_AFFILIATE_TAG = '';

/** Append the Associates tag to an Amazon URL (no-op while the tag is unset). */
export function withAffiliateTag(href: string): string {
  if (!AMAZON_AFFILIATE_TAG || !href.includes('amazon.')) return href;
  return `${href}${href.includes('?') ? '&' : '?'}tag=${AMAZON_AFFILIATE_TAG}`;
}

export interface GuideItem {
  /** External URL. Copy lives at `guide.<id>.item<n>.name` / `.body`. */
  href: string;
  /** Affiliate/paid link → rendered with rel="sponsored nofollow". */
  sponsored?: boolean;
}

export interface Guide {
  /** i18n namespace + React key. All copy lives under `guide.<id>.*`. */
  id: string;
  /** URL slug (English, identical across locales). */
  slug: string;
  /** Ids of sibling guides to cross-link at the foot of the article. */
  related: string[];
  /** Number of `guide.<id>.stepN.*` how-to steps (0 = no steps, no HowTo schema). */
  stepCount: number;
  /** Number of `guide.<id>.faqN.*` Q&A pairs (0 = no FAQ, no FAQPage schema). */
  faqCount: number;
  /** External resource list; entry N's copy lives at `guide.<id>.itemN.*`. */
  items?: GuideItem[];
}

// Amazon links point at searches rather than specific ASINs so they never go
// stale or 404; the copy recommends a category, not a brand.
const GEAR_ITEMS: GuideItem[] = [
  { href: 'https://www.amazon.com/s?k=wireless+karaoke+microphone+2+pack', sponsored: true },
  { href: 'https://www.amazon.com/s?k=bluetooth+party+speaker', sponsored: true },
  { href: 'https://www.amazon.com/s?k=hdmi+cable+10+ft', sponsored: true },
  { href: 'https://www.amazon.com/s?k=streaming+stick+with+casting', sponsored: true },
  { href: 'https://www.amazon.com/s?k=adjustable+tablet+stand', sponsored: true },
  { href: 'https://www.amazon.com/s?k=karaoke+machine+with+bluetooth+speaker', sponsored: true },
];

// Channel links verified 2026-08 (Stingray Karaoke is the former
// "The Karaoke Channel" — same channel id, rebranded).
const CHANNEL_ITEMS: GuideItem[] = [
  { href: 'https://www.youtube.com/channel/UCwTRjvjVge51X-ILJ4i22ew' }, // Sing King
  { href: 'https://www.youtube.com/channel/UCbqcG1rdt9LMwOJN4PyGTKg' }, // KaraFun
  { href: 'https://www.youtube.com/channel/UCYi9TC1HC_U2kaRAK6I4FSQ' }, // Stingray Karaoke
  { href: 'https://www.youtube.com/channel/UCWLqO9ztz16a_Ko4YB9PnFQ' }, // Party Tyme Karaoke
  { href: 'https://www.youtube.com/channel/UCIk6z4gxI5ADYK7HmNiJvNg' }, // Sing2Piano
  { href: 'https://www.youtube.com/@CCKaraoke' }, // CC Karaoke
];

export const GUIDES: Guide[] = [
  {
    id: 'athome',
    slug: 'how-to-host-karaoke-at-home',
    related: ['gear', 'tv', 'youtube'],
    stepCount: 4,
    faqCount: 0,
  },
  {
    id: 'tv',
    slug: 'karaoke-on-your-tv',
    related: ['athome', 'gear', 'youtube'],
    stepCount: 4,
    faqCount: 0,
  },
  {
    id: 'youtube',
    slug: 'free-youtube-karaoke',
    related: ['channels', 'athome', 'tv'],
    stepCount: 4,
    faqCount: 0,
  },
  {
    id: 'venue',
    slug: 'karaoke-for-bars-and-venues',
    related: ['gear', 'athome', 'youtube'],
    stepCount: 4,
    faqCount: 0,
  },
  {
    id: 'gear',
    slug: 'cheap-home-karaoke-setup',
    related: ['athome', 'tv', 'channels'],
    stepCount: 4,
    faqCount: 4,
    items: GEAR_ITEMS,
  },
  {
    id: 'channels',
    slug: 'best-youtube-karaoke-channels',
    related: ['youtube', 'gear', 'athome'],
    stepCount: 0,
    faqCount: 4,
    items: CHANNEL_ITEMS,
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

/** [1..n] — ordered i18n key indices for a per-guide section count. */
export function indices(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i + 1);
}

/** True if any item on the guide is an affiliate link (drives the disclosure). */
export function hasSponsoredItems(guide: Guide): boolean {
  return (guide.items ?? []).some((i) => i.sponsored);
}
