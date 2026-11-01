import Link from 'next/link';
import * as React from 'react';

import guideStyles from '../../styles/Guide.module.css';
import styles from '../../styles/WhatsNew.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import type { Locale } from '../../lib/i18n/config';
import { RELEASES } from '../../lib/releases';
import ReleaseCard from './ReleaseCard';
import WhatsNewShell from './WhatsNewShell';

const WhatsNewIndex = ({ locale }: { locale: Locale }): React.ReactElement => {
  const { t } = useT();
  return (
    <WhatsNewShell>
      <Link href="/" className={guideStyles.back}>
        <span aria-hidden="true">←</span> {t('guide.backHome')}
      </Link>
      <p className={guideStyles.eyebrow}>{t('whatsNew.eyebrow')}</p>
      <h1 className={guideStyles.h1}>{t('whatsNew.h1')}</h1>
      <p className={guideStyles.intro}>{t('whatsNew.intro')}</p>
      <ol className={styles.cards}>
        {RELEASES.map((release) => (
          <ReleaseCard key={release.id} release={release} locale={locale} />
        ))}
      </ol>
    </WhatsNewShell>
  );
};

export default WhatsNewIndex;
