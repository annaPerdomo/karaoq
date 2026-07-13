import * as React from 'react';
import styles from '../../styles/Display.module.css';
import QrJoinCard from '../QrJoinCard';
import BoardsSummary from '../boards/BoardsSummary';
import { DisplayConfig, QueueEntry, SingWithMePost, SuggestedSong } from '../../pages/api/types';
import { useT } from '../../lib/i18n/I18nProvider';
import formatSongTitle from '../../lib/songTitle';

interface DisplaySidebarProps {
  joinUrl: string;
  joinCode: string;
  origin: string;
  upNext: QueueEntry[];
  boardsOn: boolean;
  singWithMe: SingWithMePost[];
  suggestions: SuggestedSong[];
  displayConfig: DisplayConfig;
}

const DisplaySidebar = ({
  joinUrl,
  joinCode,
  origin,
  upNext,
  boardsOn,
  singWithMe,
  suggestions,
  displayConfig,
}: DisplaySidebarProps): React.ReactElement => {
  const { t } = useT();
  const { qrSize, showUpNext, upNextCount, welcomeLine } = displayConfig;

  return (
    <div className={styles.sidebar}>
      {qrSize !== 'hidden' && (
        <QrJoinCard
          joinUrl={joinUrl}
          joinCode={joinCode || ''}
          origin={origin}
          size={qrSize}
        />
      )}

      {welcomeLine && (
        <p className={styles.welcomeLine}>{welcomeLine}</p>
      )}

      {showUpNext && (
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
      )}

      {boardsOn && (
        <BoardsSummary
          singWithMe={singWithMe}
          suggestions={suggestions}
          cta={t('display.boards.cta')}
        />
      )}
    </div>
  );
};

export default DisplaySidebar;
