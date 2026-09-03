import { Html, Head, Main, NextScript } from 'next/document';
import { TV_PATTERN } from '../lib/deviceType';

/**
 * Flags smart TVs on <html> before the first paint. Inline and blocking rather
 * than an effect: the landing page is static and CDN-served, so there is no
 * per-request render in which to read the User-Agent. The pattern is
 * serialized out of lib/deviceType so the browser and the analytics roll-up
 * classify TVs by one definition.
 */
const TV_FLAG_SCRIPT =
  `try{if(${TV_PATTERN}.test(navigator.userAgent))` +
  `document.documentElement.setAttribute('data-tv','1')}catch(e){}`;

// `lang` is driven by the active i18n locale (not hardcoded) so localized
// landing routes like /ja render `<html lang="ja">` for crawlers and a11y.
export default function Document({ locale }) {
  return (
    <Html lang={locale || 'en'}>
      <Head>
        <script dangerouslySetInnerHTML={{ __html: TV_FLAG_SCRIPT }} />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <meta name="theme-color" content="#0f0f23" />
        <meta name="application-name" content="KaraoQ" />
        {/* Add-to-Home-Screen support so the dashboard installs as a standalone app. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="KaraoQ" />
        <meta name="mobile-web-app-capable" content="yes" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

Document.getInitialProps = async (ctx) => {
  // Must run the default document flow (it produces the `html` string Next
  // needs); we just thread the active locale through for `<Html lang>`.
  const initialProps = await ctx.defaultGetInitialProps(ctx);
  return { ...initialProps, locale: ctx.locale };
};
