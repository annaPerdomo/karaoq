import { SITE_URL, localePath, type Locale } from './i18n/config';

// Clips come from a local, gitignored capture tool (video/whats-new). Prefer MP4
// loops to GIFs: far smaller, and Google indexes them as VideoObjects.
export type ReleaseMedia =
  | {
      kind: 'video';
      mp4: string;
      webm?: string;
      poster: string;
      width: number;
      height: number;
      seconds: number;
    }
  | { kind: 'image'; src: string; width: number; height: number };

export interface Release {
  id: string;
  slug: string;
  date: string;
  highlightCount: number;
  /** Keyed by 1-based highlight index. */
  media?: Record<number, ReleaseMedia>;
  /** A lib/guides.ts id. */
  guide?: string;
  /** Clips play the fictional demo song (Neon Hearts); renders its credit note. */
  demoSong?: boolean;
}

export const RELEASES: Release[] = [
  {
    id: 'musicvideo',
    slug: 'music-video-screen-and-custom-branding',
    date: '2026-10-31',
    highlightCount: 3,
    guide: 'setups',
    media: {
      1: { kind: 'video', mp4: '/whats-new/musicvideo-1.mp4', poster: '/whats-new/musicvideo-1.webp', width: 1440, height: 810, seconds: 14.5 },
      2: { kind: 'video', mp4: '/whats-new/musicvideo-2.mp4', poster: '/whats-new/musicvideo-2.webp', width: 1440, height: 810, seconds: 14.6 },
      3: { kind: 'video', mp4: '/whats-new/musicvideo-3.mp4', poster: '/whats-new/musicvideo-3.webp', width: 1440, height: 810, seconds: 9.6 },
    },
    demoSong: true,
  },
  {
    id: 'hotideas',
    slug: 'karaoke-song-ideas-from-the-charts',
    date: '2026-10-30',
    highlightCount: 3,
    guide: 'channels',
    media: {
      2: { kind: 'video', mp4: '/whats-new/hotideas-2.mp4', poster: '/whats-new/hotideas-2.webp', width: 640, height: 1386, seconds: 11.1 },
    },
  },
  {
    id: 'mostsung',
    slug: 'most-sung-karaoke-songs',
    date: '2026-10-22',
    highlightCount: 2,
    guide: 'alternatives',
    media: {
      1: { kind: 'video', mp4: '/whats-new/mostsung-1.mp4', poster: '/whats-new/mostsung-1.webp', width: 640, height: 1386, seconds: 8.3 },
    },
  },
  {
    id: 'tvalone',
    slug: 'karaoke-on-a-smart-tv-without-a-laptop',
    date: '2026-09-24',
    highlightCount: 3,
    guide: 'tv',
  },
  {
    id: 'autoadvance',
    slug: 'auto-advance-count-in-and-song-time-limit',
    date: '2026-09-07',
    highlightCount: 4,
    guide: 'athome',
  },
  {
    id: 'pastelink',
    slug: 'add-a-song-by-pasting-a-youtube-link',
    date: '2026-08-12',
    highlightCount: 2,
    guide: 'youtube',
    media: {
      1: { kind: 'video', mp4: '/whats-new/pastelink-1.mp4', poster: '/whats-new/pastelink-1.webp', width: 640, height: 1386, seconds: 13.0 },
    },
  },
  {
    id: 'eta',
    slug: 'karaoke-queue-wait-times',
    date: '2026-08-02',
    highlightCount: 2,
    guide: 'venue',
    media: {
      2: { kind: 'video', mp4: '/whats-new/eta-2.mp4', poster: '/whats-new/eta-2.webp', width: 1440, height: 810, seconds: 10.6 },
    },
  },
  {
    id: 'customize',
    slug: 'customize-your-karaoke-screen-and-fair-rotation',
    date: '2026-07-26',
    highlightCount: 3,
    guide: 'athome',
    media: {
      2: { kind: 'video', mp4: '/whats-new/customize-2.mp4', poster: '/whats-new/customize-2.webp', width: 1440, height: 810, seconds: 11.7 },
    },
  },
  {
    id: 'languages',
    slug: 'karaoke-app-in-10-languages-with-duets',
    date: '2026-07-04',
    highlightCount: 2,
    guide: 'athome',
    media: {
      1: { kind: 'video', mp4: '/whats-new/languages-1.mp4', poster: '/whats-new/languages-1.webp', width: 640, height: 1386, seconds: 8.2 },
    },
  },
  {
    id: 'cohost',
    slug: 'karaoke-co-host-from-your-phone',
    date: '2026-06-03',
    highlightCount: 2,
    guide: 'venue',
    media: {
      1: { kind: 'video', mp4: '/whats-new/cohost-1.mp4', poster: '/whats-new/cohost-1.webp', width: 1440, height: 810, seconds: 7.5 },
    },
  },
  {
    id: 'cheers',
    slug: 'karaoke-cheers-and-shared-display',
    date: '2026-05-07',
    highlightCount: 3,
    guide: 'athome',
    media: {
      1: { kind: 'video', mp4: '/whats-new/cheers-1.mp4', poster: '/whats-new/cheers-1.webp', width: 640, height: 1386, seconds: 10.2 },
    },
  },
];

export const RELEASE_SLUGS = RELEASES.map((r) => r.slug);

export function releaseBySlug(slug: string | undefined): Release | undefined {
  return RELEASES.find((r) => r.slug === slug);
}

export function adjacentReleases(id: string): { newer: Release | null; older: Release | null } {
  const i = RELEASES.findIndex((r) => r.id === id);
  if (i < 0) return { newer: null, older: null };
  return { newer: RELEASES[i - 1] ?? null, older: RELEASES[i + 1] ?? null };
}

export function whatsNewUrl(locale: Locale): string {
  return `${SITE_URL}${localePath(locale)}/whats-new`;
}

export function releaseUrl(slug: string, locale: Locale): string {
  return `${whatsNewUrl(locale)}/${slug}`;
}

export function highlightIndices(release: Release): number[] {
  return Array.from({ length: release.highlightCount }, (_, i) => i + 1);
}

export function leadHighlight(release: Release): { n: number; media: ReleaseMedia } | null {
  for (const n of highlightIndices(release)) {
    const media = release.media?.[n];
    if (media) return { n, media };
  }
  return null;
}

export function leadMedia(release: Release): ReleaseMedia | null {
  return leadHighlight(release)?.media ?? null;
}

export function formatReleaseDate(date: string, uiLocale: string): string {
  return new Intl.DateTimeFormat(uiLocale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

export function mediaStill(media: ReleaseMedia): string {
  return media.kind === 'video' ? media.poster : media.src;
}
