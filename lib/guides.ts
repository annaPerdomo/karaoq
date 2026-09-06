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
export const AMAZON_AFFILIATE_TAG = 'karaoq-20';

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
  /** Number of `guide.<id>.secN.*` prose sections; a body splits into paragraphs on a blank line. */
  sectionCount: number;
  /** Number of `guide.<id>.stepN.*` how-to steps (0 = no steps, no HowTo schema). */
  stepCount: number;
  /** Number of `guide.<id>.faqN.*` Q&A pairs (0 = no FAQ, no FAQPage schema). */
  faqCount: number;
  /** External resource list; entry N's copy lives at `guide.<id>.itemN.*`. */
  items?: GuideItem[];
  /**
   * 1-based `items` indices keyed by the section or step that recommends them.
   * Anything placed nowhere falls through to the list at the foot of the article.
   */
  sectionItems?: Record<number, number[]>;
  stepItems?: Record<number, number[]>;
  /** 1-based step index the demo film plays inside; unset shows no film. */
  demoStep?: number;
  /** First published (ISO date) — Article schema datePublished. */
  published: string;
  /** Last substantive revision (ISO date) — shown on the page and in Article schema. */
  updated: string;
}

// Amazon links point at searches rather than specific ASINs so they never go
// stale or 404; the copy recommends a category, not a brand.
const GEAR_ITEMS: GuideItem[] = [
  { href: 'https://www.amazon.com/s?k=bluetooth+party+speaker+with+microphone+input', sponsored: true },
  { href: 'https://www.amazon.com/s?k=dynamic+vocal+microphone+xlr+handheld', sponsored: true },
  { href: 'https://www.amazon.com/s?k=3.5mm+to+1%2F4+inch+aux+cable', sponsored: true },
  { href: 'https://www.amazon.com/s?k=hdmi+cable+10+ft', sponsored: true },
  { href: 'https://www.amazon.com/s?k=wireless+karaoke+microphone+2+pack', sponsored: true },
  { href: 'https://www.amazon.com/s?k=karaoke+machine+with+bluetooth+speaker', sponsored: true },
];

// Order must match `guide.setups.itemN.*`: one link per category, Level 1 → 4.
const SETUP_ITEMS: GuideItem[] = [
  { href: 'https://www.amazon.com/s?k=bluetooth+karaoke+microphone+with+speaker', sponsored: true },
  { href: 'https://www.amazon.com/s?k=bluetooth+party+speaker+with+microphone+input', sponsored: true },
  { href: 'https://www.amazon.com/s?k=dynamic+vocal+microphone+xlr+handheld', sponsored: true },
  { href: 'https://www.amazon.com/s?k=analog+audio+mixer+with+effects+8+channel', sponsored: true },
  { href: 'https://www.amazon.com/s?k=powered+pa+speaker+12+inch', sponsored: true },
  { href: 'https://www.amazon.com/s?k=uhf+dual+wireless+microphone+system', sponsored: true },
  { href: 'https://www.amazon.com/s?k=3.5mm+to+dual+1%2F4+inch+cable', sponsored: true },
  { href: 'https://www.amazon.com/s?k=xlr+microphone+cable+25+ft+and+mic+stand', sponsored: true },
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
    related: ['setups', 'tv', 'gear'],
    sectionCount: 3,
    stepCount: 4,
    demoStep: 1,
    faqCount: 4,
    published: '2026-07-04',
    updated: '2026-09-03',
  },
  {
    id: 'tv',
    slug: 'karaoke-on-your-tv',
    related: ['setups', 'gear', 'athome'],
    sectionCount: 7,
    stepCount: 4,
    demoStep: 1,
    faqCount: 5,
    published: '2026-07-04',
    updated: '2026-09-03',
  },
  {
    id: 'youtube',
    slug: 'free-youtube-karaoke',
    related: ['channels', 'tv', 'athome'],
    sectionCount: 3,
    stepCount: 4,
    faqCount: 5,
    published: '2026-07-04',
    updated: '2026-09-03',
  },
  {
    id: 'setups',
    slug: 'home-karaoke-setup',
    related: ['gear', 'tv', 'athome'],
    sectionCount: 7,
    stepCount: 4,
    faqCount: 6,
    items: SETUP_ITEMS,
    sectionItems: { 2: [1], 3: [2, 3, 7], 4: [4, 5, 8], 5: [6] },
    published: '2026-09-03',
    updated: '2026-09-03',
  },
  {
    id: 'venue',
    slug: 'karaoke-for-bars-and-venues',
    related: ['setups', 'athome', 'youtube'],
    sectionCount: 0,
    stepCount: 4,
    demoStep: 1,
    faqCount: 0,
    published: '2026-07-04',
    updated: '2026-07-04',
  },
  {
    id: 'gear',
    slug: 'cheap-home-karaoke-setup',
    related: ['setups', 'tv', 'athome'],
    sectionCount: 3,
    stepCount: 4,
    demoStep: 1,
    faqCount: 7,
    items: GEAR_ITEMS,
    stepItems: { 2: [1, 3, 6], 3: [2, 5], 4: [4] },
    published: '2026-07-04',
    updated: '2026-09-03',
  },
  {
    id: 'channels',
    slug: 'best-youtube-karaoke-channels',
    related: ['youtube', 'setups', 'athome'],
    sectionCount: 0,
    stepCount: 0,
    faqCount: 4,
    items: CHANNEL_ITEMS,
    published: '2026-07-04',
    updated: '2026-08-01',
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

/** 1-based item indices placed under a given section or step (empty if none). */
export function placedItemIndices(
  guide: Guide,
  where: 'section' | 'step',
  n: number
): number[] {
  const map = where === 'section' ? guide.sectionItems : guide.stepItems;
  return map?.[n] ?? [];
}

/**
 * Non-empty inline groups in document order. Bounded by `sectionCount`/`stepCount`
 * on purpose: a key past those renders nowhere, so it must not count as placed.
 */
function placementEntries(guide: Guide): { where: 'section' | 'step'; n: number; items: number[] }[] {
  const entries: { where: 'section' | 'step'; n: number; items: number[] }[] = [];
  for (const where of ['section', 'step'] as const) {
    const count = where === 'section' ? guide.sectionCount : guide.stepCount;
    for (const n of indices(count)) {
      const items = placedItemIndices(guide, where, n);
      if (items.length > 0) entries.push({ where, n, items });
    }
  }
  return entries;
}

/** 1-based indices of items shown nowhere inline — these make up the foot list. */
export function unplacedItemIndices(guide: Guide): number[] {
  const placed = new Set(placementEntries(guide).flatMap((e) => e.items));
  return indices((guide.items ?? []).length).filter((n) => !placed.has(n));
}

/**
 * The first inline group carrying an affiliate link — the first *sponsored*
 * group, not the first group, or a guide opening with unpaid links discloses
 * nowhere. Null leaves the disclosure to the foot list.
 */
export function firstSponsoredPlacement(guide: Guide): { where: 'section' | 'step'; n: number } | null {
  const entry = placementEntries(guide).find((e) =>
    e.items.some((i) => guide.items?.[i - 1]?.sponsored)
  );
  return entry ? { where: entry.where, n: entry.n } : null;
}

export function hasInlinePlacements(guide: Guide): boolean {
  return placementEntries(guide).length > 0;
}
