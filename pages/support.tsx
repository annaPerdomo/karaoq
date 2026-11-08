import Link from 'next/link';
import Head from 'next/head';
import * as React from 'react';
import type { GetStaticProps, NextPage } from 'next';

import guideStyles from '../styles/Guide.module.css';
import { SITE_URL } from '../lib/i18n/config';
import { useT } from '../lib/i18n/I18nProvider';
import { localeStaticProps, type LocaleStaticProps } from '../lib/i18n/staticCatalog';
import MakerNote from '../components/support/MakerNote';

const SupportPage: NextPage = () => {
  const { t } = useT();
  const url = `${SITE_URL}/support`;

  return (
    <>
      <Head>
        <title>{`${t('support.pageTitle')} — KaraoQ`}</title>
        <meta name="description" content={t('support.homeSub')} />
        <link rel="canonical" href={url} />
      </Head>

      <div className={guideStyles.page}>
        <header className={guideStyles.topbar}>
          <Link href="/" className={guideStyles.wordmark}>KaraoQ</Link>
        </header>

        <article className={guideStyles.article}>
          <Link href="/" className={guideStyles.back}>
            <span aria-hidden="true">←</span> {t('support.back')}
          </Link>

          <p className={guideStyles.eyebrow}>{t('support.eyebrow')}</p>
          <h1 className={guideStyles.h1}>{t('support.title')}</h1>
          <MakerNote />
        </article>
      </div>
    </>
  );
};

export const getStaticProps: GetStaticProps<LocaleStaticProps> = async ({ locale }) => ({
  props: localeStaticProps(locale),
});

export default SupportPage;
