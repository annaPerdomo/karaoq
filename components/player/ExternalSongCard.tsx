import * as React from 'react';

import styles from '../../styles/ExternalSong.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import { youtubeWatchUrl } from '../../lib/externalEntry';

interface ExternalSongCardProps {
  variant: 'display' | 'host';
  singer: string;
  title: string;
  videoId: string;
  playing: boolean;
  onOpen?: () => void;
}

export default function ExternalSongCard({
  variant,
  singer,
  title,
  videoId,
  playing,
  onOpen,
}: ExternalSongCardProps) {
  const { t } = useT();

  if (variant === 'display') {
    return (
      <div className={`${styles.card} ${styles.display}`}>
        <div className={styles.tag}>{t('display.tag.onStage')}</div>
        <h1 className={styles.singer}>{singer}</h1>
        <p className={styles.song}>{title}</p>
        <p className={styles.line}>{t('external.display.line')}</p>
      </div>
    );
  }

  return (
    <div className={`${styles.card} ${styles.host}`}>
      <h1 className={styles.singer}>{singer}</h1>
      <p className={styles.song}>{title}</p>
      <p className={styles.line}>{t('external.host.line')}</p>
      <a
        className={styles.open}
        href={youtubeWatchUrl(videoId)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onOpen}
      >
        {playing ? t('external.host.reopen') : t('external.host.open')}
      </a>
    </div>
  );
}
