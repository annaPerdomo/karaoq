import type { NextPage } from 'next';
import Head from 'next/head';

import Host from '../../../components/Host';

const RemotePage: NextPage = () => {
  return (
    <>
      <Head>
        <title>KaraoQ — Co-host</title>
        <meta name="description" content="Co-hosting a KaraoQ session" />
      </Head>
      <Host remote />
    </>
  );
};

export default RemotePage;
