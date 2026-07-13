import * as React from 'react';
import styles from '../../styles/Display.module.css';
import QrJoinCard from '../QrJoinCard';
import { QueueEntry } from '../../pages/api/types';
import { useT } from '../../lib/i18n/I18nProvider';

interface AttractPanelProps {
  joinUrl: string;
  joinCode: string;
  origin: string;
  welcomeLine: string;
  queue: QueueEntry[];
  activeIndex: number;
}

// Idle promo screen shown when attractMode is on and nothing is playing: two
// full-area panels — join info, and tonight's stats — crossfading every 10s.
const AttractPanel = ({ joinUrl, joinCode, origin, welcomeLine, queue, activeIndex }: AttractPanelProps): React.ReactElement => {
  const { t, tn } = useT();
  const uniqueSingers = new Set(queue.map((e) => e.userName)).size;
  const songsPlayed = activeIndex;
  const upcoming = queue.slice(activeIndex, activeIndex + 3);

  return (
    <div className={styles.attractWrap}>
      <div className={`${styles.attractPanel} ${styles.attractPanelJoin}`}>
        <h2 className={styles.attractHeadline}>{t('display.attract.scan')}</h2>
        <QrJoinCard joinUrl={joinUrl} joinCode={joinCode} origin={origin} size="large" />
        <div className={styles.attractCode}>{joinCode.toUpperCase()}</div>
        {welcomeLine && <p className={styles.attractWelcome}>{welcomeLine}</p>}
      </div>

      <div className={`${styles.attractPanel} ${styles.attractPanelTonight}`}>
        {queue.length === 0 ? (
          <p className={styles.attractBeFirst}>{t('display.attract.beFirst')}</p>
        ) : (
          <div className={styles.attractStats}>
            <div className={styles.attractStat}>{tn('display.attract.singers', uniqueSingers)}</div>
            <div className={styles.attractStat}>{tn('display.attract.played', songsPlayed)}</div>
            {upcoming.length > 0 && (
              <div className={styles.attractUpSoon}>
                <div className={styles.attractUpSoonLabel}>{t('display.attract.upSoon')}</div>
                {upcoming.map((item) => (
                  <div key={item.id} className={styles.attractUpSoonName}>{item.userName}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AttractPanel;
