import type { NextPage } from 'next';
import Head from 'next/head';

import Analytics from '../../components/Analytics';

const AdminPage: NextPage = () => {
  return (
    <>
      <Head>
        <title>KaraoQ — Analytics</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <Analytics />
    </>
  );
};

export default AdminPage;
