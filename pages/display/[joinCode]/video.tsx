import type { NextPage } from 'next';
import Head from 'next/head';

import MusicVideoScreen from '../../../components/MusicVideoScreen';

const MusicVideoPage: NextPage = () => {
  return (
    <>
      <Head>
        <title>KaraoQ — Music video</title>
        <meta name="description" content="KaraoQ music video screen for casting" />
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <MusicVideoScreen />
    </>
  );
};

export default MusicVideoPage;
