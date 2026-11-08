import * as React from 'react';
import styles from '../../styles/Support.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import { MONTHLY_HOSTING_USD } from '../../lib/support';
import TipButton from './TipButton';

export default function MakerNote() {
  const { t, locale } = useT();
  const cost = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(MONTHLY_HOSTING_USD);

  return (
    <div className={styles.note}>
      <p className={styles.p}>{t('support.story1')}</p>
      <p className={styles.p}>{t('support.story2')}</p>
      <p className={styles.p}>{t('support.story3', { cost })}</p>
      <p className={styles.p}>{t('support.story4')}</p>
      <div className={styles.actions}>
        <TipButton />
        <p className={styles.fine}>{t('support.fine')}</p>
      </div>
      <p className={styles.signoff}>{t('support.signoff')}</p>
    </div>
  );
}
