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
import { singerKeys } from '../../lib/fairQueue';
import { useT } from '../../lib/i18n/I18nProvider';

// Folded the way fair rotation folds names, so a duet ("Anna & Bo") reads as
// "mine" for both of its singers.
function singerMatches(userName: string, key: string): boolean {
  return singerKeys(userName).includes(key);
}

/**
 * The upcoming list as a singer sees it, with a "when" against each song. Same
 * markup on the sidebar and in the mobile drawer, so the two can't drift.
 */
const SingQueueList = ({
  items,
  estimate,
  sessionEndsAt,
  className,
  mineKey,
}: {
  items: QueueEntry[];
  estimate: QueueEstimate;
  sessionEndsAt: number | null;
  className: string;
  /** singerKey of the viewer, so their own songs stand out in the list. */
  mineKey: string | null;
}): React.ReactElement => {
  const { t } = useT();

  return (
    <div className={className}>
      {items.map((item, i) => {
        const slot = slotFor(estimate, item.id);
        const afterEnd = runsPastEnd(slot, sessionEndsAt);
        const mine = !!mineKey && singerMatches(item.userName, mineKey);
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
