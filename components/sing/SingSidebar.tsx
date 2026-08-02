import * as React from 'react';
import styles from '../../styles/Sing.module.css';
import CheerBar from '../CheerBar';
import QueuePanel from './QueuePanel';
import YourTurnCard from './YourTurnCard';
import formatSongTitle from '../../lib/songTitle';
import { QueueEntry } from '../../pages/api/types';
import { QueueEstimate } from '../../lib/queueTime';
import { useT } from '../../lib/i18n/I18nProvider';

export interface SingQueueViewProps {
  /** queue.slice(activeVideoIndex) — the song on stage first. */
  upcoming: QueueEntry[];
  /** What's left to sing, excluding whoever is on stage. */
  queueItems: QueueEntry[];
  currentSong: QueueEntry | undefined;
  isPlaying: boolean;
  reactionsOn: boolean;
  username: string;
  estimate: QueueEstimate;
  sessionEndsAt: number | null;
  mineKey: string | null;
  loading: boolean;
  onReaction: (emoji: string) => void;
  reactionCooldown: boolean;
  lastSentEmoji: string | null;
}

/** The desktop column: your turn, who's on, cheers, and the queue. */
const SingSidebar = (props: SingQueueViewProps): React.ReactElement => {
  const { t } = useT();
  const {
    upcoming,
    queueItems,
    currentSong,
    isPlaying,
    reactionsOn,
    username,
    estimate,
    sessionEndsAt,
    mineKey,
    loading,
    onReaction,
    reactionCooldown,
    lastSentEmoji,
  } = props;

  return (
    <aside className={styles.sidebar}>
      {!loading && (
        <YourTurnCard
          upcoming={upcoming}
          userName={username}
          estimate={estimate}
          sessionEndsAt={sessionEndsAt}
          isPlaying={isPlaying}
        />
      )}

      {currentSong && isPlaying && (
        <div className={styles.nowPlaying}>
          <div className={styles.nowHeader}>
            <span className={styles.nowDot} />
            <span className={styles.nowLabel}>{t('sing.nowPlaying')}</span>
          </div>
          <p className={styles.nowSinger}>{currentSong.userName}</p>
          <p className={styles.nowSong}>
            {formatSongTitle(currentSong.songTitle)}
          </p>
        </div>
      )}

      {currentSong && isPlaying && reactionsOn ? (
        <CheerBar
          onReaction={onReaction}
          cooldown={reactionCooldown}
          lastSentEmoji={lastSentEmoji}
          disabled={!username.trim()}
        />
      ) : reactionsOn && queueItems.length > 0 && (
        <div className={styles.cheerHint}>
          {t('sing.cheerHint')}
        </div>
      )}

      <div className={styles.queueSection}>
        <QueuePanel
          items={queueItems}
          estimate={estimate}
          sessionEndsAt={sessionEndsAt}
          mineKey={mineKey}
          loading={loading}
          headerClass={styles.queueHeader}
          listClass={styles.queueList}
        />
      </div>
    </aside>
  );
};

export default SingSidebar;
