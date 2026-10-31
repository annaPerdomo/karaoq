import * as React from "react";
import styles from "../../styles/Host.module.css";
import { QueueEntry } from "../../pages/api/types";
import { useT } from "../../lib/i18n/I18nProvider";
import { formatSecondsLeft } from "../../lib/duration";
import { SwapButton } from "./SwapButton";
import { formatSongTitle } from "./utils";

export function TransportStatus({
  currentSong,
  isPlaying,
  autoStartIn,
  onCancelAutoStart,
  onSwapVideo,
}: {
  currentSong: QueueEntry | undefined;
  isPlaying: boolean;
  autoStartIn: number | null;
  onCancelAutoStart?: () => void;
  onSwapVideo?: () => void;
}) {
  const { t } = useT();
  return (
    <div className={styles.transportInfo}>
      {currentSong ? (
        <div className={styles.transportStatus}>
          <div
            className={`${styles.tLabel} ${isPlaying ? styles.tLabelPlaying : styles.tLabelReady}`}
          >
            {(isPlaying || autoStartIn !== null) && <span className={styles.tDot} />}
            {isPlaying ? (
              t('host.status.onStage')
            ) : autoStartIn !== null ? (
              <>
                <span className={styles.tAutoCount}>
                  {t('host.status.autoIn', { n: formatSecondsLeft(autoStartIn) })}
                </span>
                {onCancelAutoStart && (
                  <button className={styles.tAutoCancel} onClick={onCancelAutoStart}>
                    {t('host.transport.cancelAuto')}
                  </button>
                )}
              </>
            ) : (
              t('host.status.upNext')
            )}
          </div>
          <div className={styles.tSinger}>
            {currentSong.userName}
          </div>
          <div className={styles.tSongRow}>
            <div className={styles.tSong}>
              {formatSongTitle(currentSong.songTitle)}
            </div>
            {onSwapVideo && (
              <SwapButton label={t('karaokeVideo.swap')} onClick={onSwapVideo} />
            )}
          </div>
        </div>
      ) : (
        <div className={styles.transportStatus}>
          <div className={`${styles.tLabel} ${styles.tLabelEmpty}`}>
            {t('host.status.waiting')}
          </div>
          <div className={styles.tSong}>{t('host.status.noSongs')}</div>
        </div>
      )}
    </div>
  );
}
