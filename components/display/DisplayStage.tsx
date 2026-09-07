import * as React from 'react';
import styles from '../../styles/Display.module.css';
import { QueueEntry } from '../../pages/api/types';
import { useT } from '../../lib/i18n/I18nProvider';
import formatSongTitle from '../../lib/songTitle';
import { embedSrc } from '../player/embed';
import { PlaybackErrorNotice } from '../player/PlaybackErrorNotice';
import { usePlaybackError } from '../player/usePlaybackError';
import AutoStartCountdown from './AutoStartCountdown';
import WrapUpPill from '../player/WrapUpPill';

export default function DisplayStage({
  loading,
  joinCode,
  origin,
  currentSong,
  isPlaying,
  playsVideoHere,
  videoRef,
  onIframeLoad,
  needsTap,
  onUnlock,
  autoStartIn,
  autoGapSeconds,
  onStartNow,
  wrapUpIn,
  onPlaybackFailed,
}: {
  loading: boolean;
  joinCode: string | undefined;
  origin: string;
  currentSong: QueueEntry | undefined;
  isPlaying: boolean;
  playsVideoHere: boolean;
  videoRef: React.RefObject<HTMLIFrameElement>;
  onIframeLoad: () => void;
  needsTap: boolean;
  onUnlock: () => void;
  /** Seconds until auto-advance starts the waiting song; null = no countdown. */
  autoStartIn: number | null;
  autoGapSeconds: number;
  onStartNow: () => void;
  /** Seconds until the song limit cuts the video; null outside the warning window. */
  wrapUpIn: number | null;
  onPlaybackFailed: () => void;
}) {
  const { t } = useT();
  const playbackFailed = usePlaybackError({
    videoRef,
    roomId: joinCode,
    entryId: currentSong?.id,
    videoId: currentSong?.videoId,
    active: !loading && !!currentSong && isPlaying && playsVideoHere,
  });

  const onPlaybackFailedRef = React.useRef(onPlaybackFailed);
  onPlaybackFailedRef.current = onPlaybackFailed;
  React.useEffect(() => {
    if (playbackFailed) onPlaybackFailedRef.current();
  }, [playbackFailed]);

  return (
    <>
      {loading ? (
        <div className={styles.centerState}>
          <div className={styles.spinner} />
        </div>
      ) : currentSong && isPlaying && playsVideoHere ? (
        <iframe
          ref={videoRef}
          key={currentSong.id}
          className={styles.video}
          src={embedSrc(
            currentSong.videoId,
            'autoplay=1&rel=0&modestbranding=1&iv_load_policy=3&enablejsapi=1'
          )}
          allow="autoplay; encrypted-media"
          allowFullScreen
          onLoad={onIframeLoad}
        />
      ) : currentSong ? (
        <div className={styles.readyState}>
          <div className={styles.readyTag}>
            {isPlaying ? t('display.tag.onStage') : t('display.tag.upNext')}
          </div>
          <h1 className={styles.readySinger}>{currentSong.userName}</h1>
          <p className={styles.readySong}>
            {formatSongTitle(currentSong.songTitle)}
          </p>
          {autoStartIn !== null && !isPlaying && (
            <AutoStartCountdown
              secondsLeft={autoStartIn}
              totalSeconds={autoGapSeconds}
              onStartNow={onStartNow}
            />
          )}
        </div>
      ) : (
        <div className={styles.centerState}>
          <div className={styles.waitingIcon}>
            <svg width="80" height="80" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="noteGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" style={{ stopColor: 'var(--acc-a)' }} />
                  <stop offset="100%" style={{ stopColor: 'var(--acc-b)' }} />
                </linearGradient>
              </defs>
              <circle cx="18" cy="48" r="8" fill="url(#noteGrad)" />
              <circle cx="46" cy="40" r="8" fill="url(#noteGrad)" />
              <rect x="24" y="8" width="4" height="40" rx="2" fill="url(#noteGrad)" />
              <rect x="52" y="8" width="4" height="32" rx="2" fill="url(#noteGrad)" />
              <path d="M26 8 c4-4 22-8 28-4 v8 c-6-4-24 0-28 4z" fill="url(#noteGrad)" />
            </svg>
          </div>
          <h1 className={styles.waitingTitle}>KaraoQ</h1>
          <p className={styles.waitingText}>
            {t('display.waiting').split(/(\{url\}|\{code\})/).map((part, i) => {
              if (part === '{url}') return <strong key={i}>{(origin || 'karaoq.live').replace(/^https?:\/\/(www\.)?/, '')}</strong>;
              if (part === '{code}') return <strong key={i}>{joinCode?.toUpperCase()}</strong>;
              return <React.Fragment key={i}>{part}</React.Fragment>;
            })}
          </p>
        </div>
      )}

      {/* !playbackFailed: a dead video never confirms playback either, so the
          watchdog fires too and its opaque overlay would bury the notice. */}
      {needsTap && isPlaying && currentSong && !playbackFailed && (
        <button className={styles.tapOverlay} onClick={onUnlock}>
          <span className={styles.tapPlayIcon}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
          <span className={styles.tapTitle}>{t('display.tapTitle')}</span>
          <span className={styles.tapHint}>
            {t('display.tapHint')}
          </span>
        </button>
      )}

      {wrapUpIn !== null && isPlaying && currentSong && !playbackFailed && (
        <WrapUpPill secondsLeft={wrapUpIn} />
      )}

      {playbackFailed && <PlaybackErrorNotice className={styles.videoNotice} />}
    </>
  );
}
