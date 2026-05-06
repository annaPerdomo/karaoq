import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { useRouter } from 'next/router'

function AppFooter() {
  return (
    <footer className="app-footer">
      <span className="app-footer-logo">KaraoQ</span>
      <a href="https://variationsonastring.com" target="_blank" rel="noopener noreferrer" className="app-footer-link">
        variationsonastring.com
      </a>
    </footer>
  );
}

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const isLanding = router.pathname === '/';

  return (
    <>
      <Component {...pageProps} />
      {!isLanding && <AppFooter />}
    </>
  );
}

export default MyApp
