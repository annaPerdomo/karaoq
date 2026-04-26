import type { NextPage } from 'next';
import Head from 'next/head';

import Home from '../components/Home';

const HomePage: NextPage = () => {
  return (
    <>
      <Head>
        <title>KaraoQ — YouTube Karaoke with Friends</title>
        <meta name="description" content="Host a karaoke session and let your friends queue up songs from YouTube" />
      </Head>
      <Home />
    </>
  );
};

export default HomePage;
