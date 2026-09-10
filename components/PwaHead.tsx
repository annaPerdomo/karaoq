import Head from 'next/head';

// Per route so /admin installs as its own app. iOS takes the title and icon
// from these metas over the manifest, so they must switch with it.
export default function PwaHead({ admin }: { admin: boolean }) {
  const manifest = admin ? '/admin.webmanifest' : '/site.webmanifest';
  const title = admin ? 'Mission Control' : 'KaraoQ';
  const touchIcon = admin ? '/admin-apple-touch-icon.png' : '/apple-touch-icon.png';
  return (
    <Head>
      <link rel="manifest" href={manifest} key="manifest" />
      <link rel="apple-touch-icon" sizes="180x180" href={touchIcon} key="apple-touch-icon" />
      <meta name="application-name" content={title} />
      <meta name="apple-mobile-web-app-title" content={title} />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      <meta name="mobile-web-app-capable" content="yes" />
    </Head>
  );
}
