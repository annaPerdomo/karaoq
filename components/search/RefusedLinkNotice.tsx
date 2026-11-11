import * as React from 'react';

import styles from '../../styles/SongSearch.module.css';
import { useT } from '../../lib/i18n/I18nProvider';

interface RefusedLinkNoticeProps {
  title: string;
  hasCuts: boolean;
  canQueueOutside: boolean;
  onQueueOutside: () => void;
  /** With playable versions listed, the title sits above them and the
   * queue-anyway action below, so the versions read as the first choice. */
  part?: 'all' | 'head' | 'action';
}

const RefusedLinkNotice: React.FC<RefusedLinkNoticeProps> = ({
  title,
  hasCuts,
  canQueueOutside,
  onQueueOutside,
  part = 'all',
}) => {
  const { t } = useT();
  const hintId = React.useId();

  return (
    <div className={styles.refusedNotice}>
      {part !== 'action' && (
        <p className={styles.unavailableTitle}>{t('search.refused.title', { title })}</p>
      )}
      {part !== 'action' && hasCuts && (
        <p className={styles.unavailableBody}>{t('search.refused.withCuts')}</p>
      )}
      {part !== 'head' && canQueueOutside && (
        <>
          <button
            type="button"
            className={styles.refusedButton}
            onClick={onQueueOutside}
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
