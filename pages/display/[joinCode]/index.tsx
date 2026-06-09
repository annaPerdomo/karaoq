import type { NextPage } from 'next';
import Head from 'next/head';

import Display from '../../../components/Display';

const DisplayPage: NextPage = () => {
  return (
    <>
      <Head>
        <title>KaraoQ — Display</title>
        <meta name="description" content="KaraoQ display for casting" />
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <Display />
    </>
  );
};

export default DisplayPage;
