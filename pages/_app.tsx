import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { useRouter } from 'next/router'

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
  const showFooter = !isLanding && !isDisplay && !isHost && !isAdmin;

  return (
    <>
      <Component {...pageProps} />
      {showFooter && <AppFooter />}
    </>
  );
}

export default MyApp
