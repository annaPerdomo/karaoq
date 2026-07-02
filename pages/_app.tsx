import '../styles/globals.css'
import type { AppProps } from 'next/app'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { Analytics } from '@vercel/analytics/next'

function AppFooter() {
  return (
    <footer className="app-footer">
      <span className="app-footer-logo">KaraoQ</span>
      <a href="https://variationsonastring.com" target="_blank" rel="noopener noreferrer" className="app-footer-link">
        made with <span className="app-footer-heart">&#9829;</span> by variations on a string
      </a>
    </footer>
  );
}

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const isLanding = router.pathname === '/';
  const isDisplay = router.pathname.startsWith('/display');
  const isHost = router.pathname.startsWith('/host');
  const isAdmin = router.pathname.startsWith('/admin');
  const isSing = router.pathname.startsWith('/sing');
  const showFooter = !isLanding && !isDisplay && !isHost && !isAdmin && !isSing;

  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Component {...pageProps} />
      {showFooter && <AppFooter />}
      <Analytics />
    </>
  );
}

export default MyApp
