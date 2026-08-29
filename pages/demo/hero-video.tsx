import Head from 'next/head';
import { useRouter } from 'next/router';
import HeroVideoStage from '../../components/herovideo/HeroVideoStage';

// The capture pipeline (video/hero-demo/) records this frame-by-frame into
// public/demo/hero-demo.*. Not linked from anywhere; renders from fixture data.
//
//   /demo/hero-video            live 20s loop (design preview)
//   /demo/hero-video?t=12000    hold one frame at 12s
//   /demo/hero-video?capture=1  frozen; the capture script drives the clock
//
// Under ?capture=1, nothing here — page, body, or wrapper — may paint a
// background: capture uses `omitBackground`, so any opaque layer fills the
// alpha channel and the black rectangle returns on the landing page.
export default function HeroVideoPage() {
  const { query } = useRouter();
  const transparent = query.capture !== undefined;
  return (
    <>
      <Head>
        <title>KaraoQ — hero demo stage</title>
        <meta name="robots" content="noindex" />
      </Head>
      {transparent && (
        <style>{'html, body { background: transparent !important; }'}</style>
      )}
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'flex-start',
          background: transparent ? 'transparent' : '#0f0f23',
        }}
      >
        <HeroVideoStage />
      </div>
    </>
  );
}
