import * as React from 'react';

import styles from '../../styles/SongSearch.module.css';
import { useT } from '../../lib/i18n/I18nProvider';

interface RefusedLinkNoticeProps {
  title: string;
  hasCuts: boolean;
  canQueueOutside: boolean;
  onQueueOutside: () => void;
}

const RefusedLinkNotice: React.FC<RefusedLinkNoticeProps> = ({
  title,
  hasCuts,
  canQueueOutside,
  onQueueOutside,
}) => {
  const { t } = useT();
  const hintId = React.useId();

  return (
    <div className={styles.refusedNotice}>
      <p className={styles.unavailableTitle}>{t('search.refused.title', { title })}</p>
      {hasCuts && <p className={styles.unavailableBody}>{t('search.refused.withCuts')}</p>}
      {canQueueOutside && (
        <>
          <button
            type="button"
            className={styles.refusedButton} onClick={onQueueOutside}
            aria-describedby={hintId}
          >
            {t('search.refused.queueAnyway')}
          </button>
          <p id={hintId} className={styles.unavailableBody}>
            {t('search.refused.queueAnywayHint')}
          </p>
        </>
      )}
    </div>
  );
};

export default RefusedLinkNotice;
