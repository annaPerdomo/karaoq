import * as React from 'react';
import styles from '../../styles/Sing.module.css';
import formatSongTitle from '../../lib/songTitle';
import { QueueEntry } from '../../pages/api/types';
import {
  QueueEstimate,
  etaLabel,
  runsPastEnd,
  slotFor,
} from '../../lib/queueTime';
import { sharesSinger } from '../../lib/fairQueue';
import { useT } from '../../lib/i18n/I18nProvider';

/**
 * The upcoming list as a singer sees it, with a "when" against each song. Same
 * markup on the sidebar and in the mobile drawer, so the two can't drift.
 */
const SingQueueList = ({
  items,
  estimate,
  sessionEndsAt,
  className,
  viewerName,
}: {
  items: QueueEntry[];
  estimate: QueueEstimate;
  sessionEndsAt: number | null;
  className: string;
  /** The viewer's name, so their own songs stand out in the list. */
  viewerName: string;
}): React.ReactElement => {
  const { t } = useT();

  return (
    <div className={className}>
      {items.map((item, i) => {
        const slot = slotFor(estimate, item.id);
        const afterEnd = runsPastEnd(slot, sessionEndsAt);
        const mine = sharesSinger(item.userName, viewerName);
        return (
          <div
            key={item.id}
            className={`${styles.queueItem} ${mine ? styles.queueItemMine : ''}`}
          >
            <span className={styles.queueNum}>{i + 1}</span>
            <div className={styles.queueInfo}>
              <span className={styles.queueSinger}>{item.userName}</span>
              <span className={styles.queueSong}>
                {formatSongTitle(item.songTitle)}
              </span>
            </div>
            {slot && (
              <span className={styles.queueEta}>
                {etaLabel(slot.startsInSeconds, t)}
                {afterEnd && (
                  <span className={styles.queueEtaOver}>
                    {t('queue.eta.afterEnd')}
                  </span>
                )}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default SingQueueList;
