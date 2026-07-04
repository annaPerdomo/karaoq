/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Sub-path locale routing (/, /ja, /es, …) so every supported language has a
  // crawlable, server-rendered landing URL for SEO. localeDetection is off:
  // we keep our own client-side detection on `/` (see I18nProvider) and let the
  // localized URLs + hreflang do the SEO work, rather than auto-redirecting.
  i18n: {
    locales: ['en', 'ja', 'fil', 'es', 'ko', 'pt', 'de', 'id', 'cs', 'fr'],
    defaultLocale: 'en',
    localeDetection: false,
  },
}

module.exports = nextConfig
