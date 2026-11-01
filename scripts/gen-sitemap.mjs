// Regenerates public/sitemap.xml from the locale list + content routes.
// Run: `node scripts/gen-sitemap.mjs` (also wired as `pnpm sitemap`).
//
// Keep LOCALES in sync with next.config.js `i18n.locales`, GUIDE_SLUGS with
// lib/guides.ts `GUIDES[].slug`, and RELEASE_SLUGS with lib/releases.ts
// (tests/lib/releases.test.ts checks the last one). The i18n parity test guards the strings;
// this list is small and rarely changes, so it's inlined rather than imported
// from TypeScript.

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const SITE_URL = 'https://www.karaoq.live';
const DEFAULT_LOCALE = 'en';
const LOCALES = ['en', 'ja', 'fil', 'es', 'ko', 'pt', 'de', 'id', 'cs', 'fr'];

// Guide slugs (English, shared across locales) — mirror lib/guides.ts.
const GUIDE_SLUGS = [
  'how-to-host-karaoke-at-home',
  'karaoke-on-your-tv',
  'free-youtube-karaoke',
  'home-karaoke-setup',
  'karaoke-for-bars-and-venues',
  'cheap-home-karaoke-setup',
  'best-youtube-karaoke-channels',
  'free-karaoke-app-alternatives',
];

// A release page never changes after it ships: its lastmod is its date.
const RELEASES = [
  ['music-video-screen-and-custom-branding', '2026-10-31'],
  ['karaoke-song-ideas-from-the-charts', '2026-10-30'],
  ['most-sung-karaoke-songs', '2026-10-22'],
  ['karaoke-on-a-smart-tv-without-a-laptop', '2026-09-24'],
  ['auto-advance-count-in-and-song-time-limit', '2026-09-07'],
  ['add-a-song-by-pasting-a-youtube-link', '2026-08-12'],
  ['karaoke-queue-wait-times', '2026-08-02'],
  ['customize-your-karaoke-screen-and-fair-rotation', '2026-07-26'],
  ['karaoke-app-in-10-languages-with-duets', '2026-07-04'],
  ['karaoke-co-host-from-your-phone', '2026-06-03'],
  ['karaoke-cheers-and-shared-display', '2026-05-07'],
];

// Countries that currently clear CHART_MIN_SONGS (lib/songCharts.ts) in the
// shared Atlas DB, checked 2026-10-22 — rerun that query before extending this.
const SONG_CHART_PASSING_COUNTRIES = ['us', 'ph', 'ca', 'fr'];

// A page = a path suffix rendered in every locale. '' is the landing root.
const PAGES = [
  { path: '', priority: '1.0', changefreq: 'weekly' },
  ...GUIDE_SLUGS.map((slug) => ({
    path: `/guide/${slug}`,
    priority: '0.8',
    changefreq: 'monthly',
  })),
  { path: '/songs', priority: '0.8', changefreq: 'daily' },
  { path: '/whats-new', priority: '0.7', changefreq: 'weekly' },
  ...RELEASES.map(([slug, date]) => ({
    path: `/whats-new/${slug}`,
    priority: '0.6',
    changefreq: 'yearly',
    lastmod: date,
  })),
  ...SONG_CHART_PASSING_COUNTRIES.map((cc) => ({
    path: `/songs/${cc}`,
    priority: '0.7',
    changefreq: 'daily',
  })),
];

const LASTMOD = process.env.SITEMAP_DATE || new Date().toISOString().slice(0, 10);

function localePrefix(locale) {
  return locale === DEFAULT_LOCALE ? '' : `/${locale}`;
}

function urlFor(locale, pagePath) {
  return `${SITE_URL}${localePrefix(locale)}${pagePath}`;
}

function urlBlock(pagePath, priority, changefreq, lastmod = LASTMOD) {
  const alternates = LOCALES.map(
    (l) =>
      `    <xhtml:link rel="alternate" hreflang="${l}" href="${urlFor(l, pagePath)}"/>`
  );
  alternates.push(
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${urlFor(DEFAULT_LOCALE, pagePath)}"/>`
  );
  return LOCALES.map((locale) =>
    [
      '  <url>',
      `    <loc>${urlFor(locale, pagePath)}</loc>`,
      ...alternates,
      `    <lastmod>${lastmod}</lastmod>`,
      `    <changefreq>${changefreq}</changefreq>`,
      `    <priority>${priority}</priority>`,
      '  </url>',
    ].join('\n')
  ).join('\n');
}

const body = PAGES.map((p) => urlBlock(p.path, p.priority, p.changefreq, p.lastmod)).join('\n');

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${body}
</urlset>
`;

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sitemap.xml');
writeFileSync(out, xml);
console.log(`Wrote ${out} — ${PAGES.length} pages × ${LOCALES.length} locales = ${PAGES.length * LOCALES.length} URLs`);
