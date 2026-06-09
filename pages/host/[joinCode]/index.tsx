import type { NextPage } from 'next';
import Head from 'next/head';

import Host from '../../../components/Host';

const HostPage: NextPage = () => {
  return (
    <>
      <Head>
        <title>KaraoQ — Hosting</title>
        <meta name="description" content="Hosting a KaraoQ session" />
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <Host />
    </>
  );
};

export default HostPage;
