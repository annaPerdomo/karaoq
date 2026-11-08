import * as React from 'react';
import styles from '../../styles/Support.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import { TIP_URL } from '../../lib/support';

export default function TipButton() {
  const { t } = useT();
  return (
    <a
      href={TIP_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.tipButton}
    >
      <span aria-hidden="true">♥</span> {t('support.cta')}
    </a>
  );
}
