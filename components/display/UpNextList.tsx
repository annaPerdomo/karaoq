import * as React from 'react';
import styles from '../../styles/Display.module.css';
import { QueueEntry } from '../../pages/api/types';
import { useT } from '../../lib/i18n/I18nProvider';
import formatSongTitle from '../../lib/songTitle';

interface UpNextListProps {
  upNext: QueueEntry[];
  upNextCount: number;
}

const UpNextList = ({ upNext, upNextCount }: UpNextListProps): React.ReactElement => {
  const { t } = useT();

  return (
    <div className={styles.upNextSection}>
      <h3 className={styles.upNextTitle}>
        {t('display.upNextTitle')}
        {upNext.length > 0 && (
          <span className={styles.upNextCount}>{upNext.length}</span>
        )}
      </h3>
      {upNext.length > 0 ? (
        <div className={styles.upNextList}>
          {upNext.slice(0, upNextCount).map((item, i) => (
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
            </div>
          ))}
          {upNext.length > upNextCount && (
            <div className={styles.moreCount}>
              {t('display.moreCount', { count: upNext.length - upNextCount })}
            </div>
          )}
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
