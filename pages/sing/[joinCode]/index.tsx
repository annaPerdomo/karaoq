import type { NextPage } from 'next';
import Head from 'next/head';

import Sing from '../../../components/Sing';

const SingPage: NextPage = () => {
  return (
    <>
      <Head>
        <title>KaraoQ — Add Songs</title>
        <meta name="description" content="Add songs to the KaraoQ queue" />
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <Sing />
    </>
  );
};

export default SingPage;
