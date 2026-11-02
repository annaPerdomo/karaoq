import * as React from 'react';

import styles from '../../styles/SongSearch.module.css';
import { useT } from '../../lib/i18n/I18nProvider';

/** The search's own equalizer, shown while a place's lists are on their way —
 *  so switching countries reads as working, not as nothing happening. */
const IdeasLoading: React.FC = () => {
  const { t } = useT();
  return (
    <div className={styles.loadingHeader} aria-live="polite" aria-busy="true">
      <span className={styles.eq} aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
      </span>
      <span className={styles.loadingText}>{t('search.finding')}</span>
    </div>
  );
};

export default IdeasLoading;
