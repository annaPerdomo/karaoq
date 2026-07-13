import * as React from 'react';
import styles from '../../styles/Display.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import formatSongTitle from '../../lib/songTitle';

interface NowPlayingBarProps {
  singerName: string;
  songTitle: string;
}

const NowPlayingBar = ({ singerName, songTitle }: NowPlayingBarProps): React.ReactElement => {
  const { t } = useT();

  return (
    <div className={styles.nowBar}>
      <div className={styles.nowGlow} />
      <div className={styles.nowContent}>
        <div className={styles.nowTop}>
          <span className={styles.nowDot} />
          <span className={styles.nowLabel}>{t('display.tag.onStage')}</span>
        </div>
        <div className={styles.nowSinger}>{singerName}</div>
        <div className={styles.nowSong}>
          {formatSongTitle(songTitle)}
        </div>
      </div>
    </div>
  );
};

export default NowPlayingBar;
