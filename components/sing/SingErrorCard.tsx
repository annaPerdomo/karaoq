import * as React from 'react';
import Link from 'next/link';

import styles from '../../styles/Sing.module.css';
import { useT } from '../../lib/i18n/I18nProvider';

type SingErrorCardProps =
  | { variant: 'notFound'; message: string; onGoHome: () => void }
  | { variant: 'connection'; onRetry: () => void };

export default function SingErrorCard(props: SingErrorCardProps): React.ReactElement {
  const { t } = useT();

  if (props.variant === 'connection') {
    return (
      <div className={styles.errorCard}>
        <div className={styles.errorIcon}>📶</div>
        <h2>{t('common.connectionErrorTitle')}</h2>
        <p>{t('common.connectionErrorBody')}</p>
        <button className={styles.btnPink} onClick={props.onRetry}>
          {t('common.retry')}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.errorCard}>
      <div className={styles.errorIcon}>😕</div>
      <h2>{t('sing.error.title')}</h2>
      <p>{props.message}</p>
      <button className={styles.btnPink} onClick={props.onGoHome}>
        {t('common.goHome')}
      </button>
      <Link
        href="/?ref=room-ended"
        className={`${styles.inlineFooterLink} ${styles.errorCardLink}`}
      >
        {t('sing.error.hostOwn')}
      </Link>
    </div>
  );
}
