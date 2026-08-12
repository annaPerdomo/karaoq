import type { NextPage } from 'next';
import Head from 'next/head';

import Admin from '../../components/Admin';

const AdminPage: NextPage = () => {
  return (
    <>
      <Head>
        <title>KaraoQ — Mission Control</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <Admin />
    </>
  );
};

export default AdminPage;
