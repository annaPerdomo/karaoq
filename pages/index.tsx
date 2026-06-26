import type { NextPage } from 'next';
import Head from 'next/head';

import Home, { FAQ_ITEMS } from '../components/Home';

const HomePage: NextPage = () => {
  return (
    <>
      <Head>
        <title>KaraoQ — YouTube Karaoke App | No Downloads, No Sign-Up</title>
        <meta
          name="description"
          content="Turn any gathering into karaoke night with KaraoQ. Search YouTube for songs, build a shared queue from your phone, and sing with friends. No downloads, works on any device."
        />
        <meta name="keywords" content="karaoke app, YouTube karaoke, online karaoke, karaoke with friends, karaoke queue, karaoke night, karaoke party, sing karaoke online, live reactions" />
        <link rel="canonical" href="https://www.karaoq.live" />

        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.karaoq.live" />
        <meta property="og:title" content="KaraoQ — YouTube Karaoke App" />
        <meta
          property="og:description"
          content="Turn any gathering into karaoke night. Guests pick songs from their phones, you control the queue — all powered by YouTube. No sign-up needed."
        />
        <meta property="og:site_name" content="KaraoQ" />
        <meta property="og:locale" content="en_US" />
        <meta property="og:image" content="https://www.karaoq.live/og-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="KaraoQ — YouTube karaoke from your phone, no downloads or sign-up" />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="KaraoQ — YouTube Karaoke App" />
        <meta
          name="twitter:description"
          content="Turn any gathering into karaoke night. Search YouTube, build a queue from your phone, cheer on your friends, and sing."
        />
        <meta name="twitter:image" content="https://www.karaoq.live/og-image.png" />
        <meta name="twitter:image:alt" content="KaraoQ — YouTube karaoke from your phone, no downloads or sign-up" />

        {/* JSON-LD Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebApplication',
              name: 'KaraoQ',
              url: 'https://www.karaoq.live',
              description:
                'A YouTube-powered karaoke app. Create a room, share the code, and let your friends queue songs from their phones.',
              applicationCategory: 'EntertainmentApplication',
              operatingSystem: 'Any',
              featureList: [
                'YouTube song search',
                'Shared karaoke queue',
                'Real-time sync across devices',
                'TV display mode with QR code',
                'Drag and drop queue reordering',
                'Live audience reactions',
                'No downloads or sign-up required',
              ],
            }),
          }}
        />

        {/* JSON-LD FAQ — mirrors the visible FAQ section */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: FAQ_ITEMS.map((item) => ({
                '@type': 'Question',
                name: item.question,
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: item.answer,
                },
              })),
            }),
          }}
        />
      </Head>
      <Home />
    </>
  );
};

export default HomePage;
