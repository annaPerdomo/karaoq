import * as React from 'react';
import styles from '../../styles/Display.module.css';
import { QueueEntry } from '../../pages/api/types';
import { useT } from '../../lib/i18n/I18nProvider';
import formatSongTitle from '../../lib/songTitle';
import {
  QueueEstimate,
  etaLabel,
  formatApproxDuration,
  slotFor,
} from '../../lib/queueTime';

interface UpNextListProps {
  upNext: QueueEntry[];
  /** Absent while customizing, where the list renders sample content. */
  estimate?: QueueEstimate;
}

const UpNextList = ({ upNext, estimate }: UpNextListProps): React.ReactElement => {
  const { t } = useT();

  return (
    <div className={styles.upNextSection}>
      <h3 className={styles.upNextTitle}>
        {t('display.upNextTitle')}
        {upNext.length > 0 && (
          <span className={styles.upNextCount}>{upNext.length}</span>
        )}
        {/* The whole room reads this off the TV — it answers "have we got time
            for one more?" without anyone asking the host. */}
        {estimate && estimate.slots.length > 0 && (
          <span className={styles.upNextTotal}>
            {t('queue.eta.total', {
              time: formatApproxDuration(estimate.totalSeconds, t),
            })}
          </span>
        )}
      </h3>
      {/* No cap: the list fills the sidebar and clips what doesn't fit. The
          title's badge still carries the true total. */}
      {upNext.length > 0 ? (
        <div className={styles.upNextList}>
          {upNext.map((item, i) => {
            const slot = estimate ? slotFor(estimate, item.id) : null;
            return (
              <div key={item.id} className={styles.upNextItem}>
                <span className={styles.upNextNum}>{i + 1}</span>
                <div className={styles.upNextInfo}>
                  <span
                    className={styles.upNextItemSinger}
                    title={item.userName}
                  >
                    {item.userName}
                  </span>
                  <span
                    className={styles.upNextItemSong}
                    title={formatSongTitle(item.songTitle)}
                  >
                    {formatSongTitle(item.songTitle)}
                  </span>
                </div>
                {slot && (
                  <span className={styles.upNextEta}>
                    {etaLabel(slot.startsInSeconds, t)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className={styles.emptyQueue}>
          {t('display.emptyQueue')}
        </p>
      )}
    </div>
  );
};

export default UpNextList;
