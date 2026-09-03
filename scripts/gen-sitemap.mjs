// Regenerates public/sitemap.xml from the locale list + content routes.
// Run: `node scripts/gen-sitemap.mjs` (also wired as `pnpm sitemap`).
//
// Keep LOCALES in sync with next.config.js `i18n.locales` and SLUGS in sync
// with lib/guides.ts `GUIDES[].slug`. The i18n parity test guards the strings;
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
];

// A page = a path suffix rendered in every locale. '' is the landing root.
const PAGES = [
  { path: '', priority: '1.0', changefreq: 'weekly' },
  ...GUIDE_SLUGS.map((slug) => ({
    path: `/guide/${slug}`,
    priority: '0.8',
    changefreq: 'monthly',
  })),
];

const LASTMOD = process.env.SITEMAP_DATE || new Date().toISOString().slice(0, 10);

function localePrefix(locale) {
  return locale === DEFAULT_LOCALE ? '' : `/${locale}`;
}

function urlFor(locale, pagePath) {
  return `${SITE_URL}${localePrefix(locale)}${pagePath}`;
}

function urlBlock(pagePath, priority, changefreq) {
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
      `    <lastmod>${LASTMOD}</lastmod>`,
      `    <changefreq>${changefreq}</changefreq>`,
      `    <priority>${priority}</priority>`,
      '  </url>',
    ].join('\n')
  ).join('\n');
}

const body = PAGES.map((p) => urlBlock(p.path, p.priority, p.changefreq)).join('\n');

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${body}
</urlset>
`;

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sitemap.xml');
writeFileSync(out, xml);
console.log(`Wrote ${out} — ${PAGES.length} pages × ${LOCALES.length} locales = ${PAGES.length * LOCALES.length} URLs`);
