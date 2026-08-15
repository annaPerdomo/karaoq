import '../styles/globals.css'
import { useEffect } from 'react'
import type { AppProps } from 'next/app'
import Head from 'next/head'
import { useRouter } from 'next/router'
// The /react entry, not /next: the /next one is App-Router-only — it renders a
// <Suspense> boundary that pages-router route updates can hit before it
// hydrates, which crashes slow phones with React error #421.
import { Analytics } from '@vercel/analytics/react'
import { I18nProvider, useT } from '../lib/i18n/I18nProvider'
import { renderWithHeart } from '../lib/i18n/renderWithHeart'
import { installErrorReporting } from '../lib/errorReporting'
import FeedbackTrigger from '../components/feedback/FeedbackTrigger'

function AppFooter() {
  const { t } = useT();
  return (
    <footer className="app-footer">
      <span className="app-footer-logo">KaraoQ</span>
      <a href="https://variationsonastring.com" target="_blank" rel="noopener noreferrer" className="app-footer-link app-footer-credit">
        {renderWithHeart(t('footer.credit'), 'app-footer-heart')}
      </a>
      <FeedbackTrigger className="app-footer-link app-footer-feedback" />
    </footer>
  );
}

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();
  useEffect(() => {
    installErrorReporting();
  }, []);
  const isLanding = router.pathname === '/';
  const isDisplay = router.pathname.startsWith('/display');
  const isHost = router.pathname.startsWith('/host');
  const isAdmin = router.pathname.startsWith('/admin');
  const isSing = router.pathname.startsWith('/sing');
  const showFooter = !isLanding && !isDisplay && !isHost && !isAdmin && !isSing;

  return (
    <I18nProvider
      initialLocale={pageProps.i18nLocale ?? null}
      initialCatalog={pageProps.i18nCatalog ?? null}
    >
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Component {...pageProps} />
      {showFooter && <AppFooter />}
      {/* Passing route turns the script's own auto-tracking off, which would
          otherwise send raw pathnames — and a join code is the whole key to a
          room. Gated on isReady: room pages are statically optimized, so
          asPath settles a tick late and would bill one visit as two. */}
      {router.isReady && <Analytics route={router.pathname} path={router.asPath} />}
    </I18nProvider>
  );
}

export default MyApp
