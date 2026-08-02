import * as React from 'react';
import styles from '../../styles/Sing.module.css';
import SingQueueList from './SingQueueList';
import { QueueEntry } from '../../pages/api/types';
import {
  QueueEstimate,
  formatApproxDuration,
  formatClockTime,
} from '../../lib/queueTime';
import { useT } from '../../lib/i18n/I18nProvider';

/** Shared by the sidebar and the mobile drawer so the two can't drift. */
const QueuePanel = ({
  items,
  estimate,
  sessionEndsAt,
  viewerName,
  loading,
  headerClass,
  listClass,
}: {
  items: QueueEntry[];
  estimate: QueueEstimate;
  sessionEndsAt: number | null;
  viewerName: string;
  loading: boolean;
  headerClass: string;
  listClass: string;
}): React.ReactElement => {
  const { t, locale } = useT();

  return (
    <>
      <div className={headerClass}>
        <h3 className={styles.queueTitle}>{t('sing.upNext')}</h3>
        <div className={styles.queueHeaderRight}>
          {items.length > 0 && (
            <span className={styles.queueTotalTime} title={t('queue.eta.note')}>
              {t('queue.eta.total', {
                time: formatApproxDuration(estimate.totalSeconds, t),
              })}
            </span>
          )}
          {items.length > 0 && (
            <span className={styles.queueBadge}>{items.length}</span>
          )}
        </div>
      </div>

      {sessionEndsAt !== null && (
        <div className={styles.queueEndNote}>
          {t('sing.eta.roomEnds', {
            time: formatClockTime(sessionEndsAt, locale),
          })}
        </div>
      )}

      {loading ? (
        <div className={styles.loadingQueue}>
          <div className={styles.spinner} />
        </div>
      ) : items.length > 0 ? (
        <SingQueueList
          items={items}
          estimate={estimate}
          sessionEndsAt={sessionEndsAt}
          className={listClass}
          viewerName={viewerName}
        />
      ) : (
        <div className={styles.emptyQueue}>
          <p>{t('sing.queue.emptyTitle')}</p>
          <span>{t('sing.queue.emptyBody')}</span>
        </div>
      )}
    </>
  );
};

export default QueuePanel;
