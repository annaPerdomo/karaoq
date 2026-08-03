import styles from "../../styles/Host.module.css";
import { QueueEntry } from "../../pages/api/types";
import { useT } from "../../lib/i18n/I18nProvider";
import { renderWithHeart } from "../../lib/i18n/renderWithHeart";
import FullscreenToggle from "../FullscreenToggle";
import FeedbackTrigger from "../feedback/FeedbackTrigger";
import { Icons } from "./icons";
import { formatSongTitle } from "./utils";

// Transport bar — host only; co-hosts don't control playback. The control
// cluster branches by where the video plays: TV display (pause/stop), here
// (pause-toggle/stop), or idle/takeover (a single Play).
export function TransportBar({
  roomId,
  roomEmpty,
  currentSong,
  isPlaying,
  tvMode,
  displayConnected,
  displayPaused,
  playsVideoHere,
  hereVideoPlaying,
  activeIndex,
  queueLength,
  onPrevious,
  onToggleDisplayPause,
  onStop,
  onToggleHereVideo,
  onStart,
  onNext,
}: {
  roomId?: string;
  roomEmpty: boolean;
  currentSong: QueueEntry | undefined;
  isPlaying: boolean;
  tvMode: boolean;
  displayConnected: boolean;
  displayPaused: boolean;
  playsVideoHere: boolean;
  hereVideoPlaying: boolean;
  activeIndex: number;
  queueLength: number;
  onPrevious: () => void;
  onToggleDisplayPause: () => void;
  onStop: () => void;
  onToggleHereVideo: () => void;
  onStart: () => void;
  onNext: () => void;
}) {
  const { t } = useT();
  return (
    <div
      className={`${styles.transport} ${roomEmpty ? styles.transportEmptyMobile : ""}`}
    >
      <div className={styles.transportMain}>
        <div className={styles.transportInfo}>
          {currentSong ? (
            <div className={styles.transportStatus}>
              <div
                className={`${styles.tLabel} ${isPlaying ? styles.tLabelPlaying : styles.tLabelReady}`}
              >
                {isPlaying && <span className={styles.tDot} />}
                {isPlaying ? t('host.status.onStage') : t('host.status.upNext')}
              </div>
              <div className={styles.tSinger}>
                {currentSong.userName}
              </div>
              <div className={styles.tSong}>
                {formatSongTitle(currentSong.songTitle)}
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
        <div className={styles.transportControls}>
          <button
            className={styles.tBtn}
            onClick={onPrevious}
            disabled={activeIndex <= 0}
            title={t('host.transport.previous')}
          >
            {Icons.prev}
          </button>
          {isPlaying && tvMode ? (
            // Playing on a separate display: pause/resume that screen
            // from here (only useful with a live display to receive
            // it), plus a Stop.
            <>
              {displayConnected && (
                <button
                  className={`${styles.tBtn} ${styles.tPause}`}
                  onClick={onToggleDisplayPause}
                  title={
                    displayPaused
                      ? t('host.transport.resumeDisplay')
                      : t('host.transport.pauseDisplay')
                  }
                >
                  {displayPaused ? Icons.resume : Icons.pause}
                </button>
              )}
              <button
                className={`${styles.tBtn} ${styles.tStop}`}
                onClick={onStop}
                title={t('host.transport.stop')}
              >
                {Icons.stop}
              </button>
            </>
          ) : playsVideoHere ? (
            // Video plays on this device. Give a real Pause/Play toggle
            // plus a Stop (parity with TV mode) so the host isn't left
            // hunting for YouTube's own chrome — and so a blocked
            // autoplay has a one-tap recovery.
            <>
              <button
                className={`${styles.tBtn} ${styles.tPause}`}
                onClick={onToggleHereVideo}
                title={hereVideoPlaying ? t('host.transport.pause') : t('host.transport.play')}
              >
                {hereVideoPlaying ? Icons.pause : Icons.resume}
              </button>
              <button
                className={`${styles.tBtn} ${styles.tStop}`}
                onClick={onStop}
                title={t('host.transport.stop')}
              >
                {Icons.stop}
              </button>
            </>
          ) : (
            // Nothing playing here: either idle, or the song is live on
            // another host device and this is the takeover control.
            <button
              className={`${styles.tBtn} ${styles.tPlay}`}
              onClick={onStart}
              disabled={!currentSong}
              title={
                tvMode
                  ? t('host.transport.playOther')
                  : isPlaying
                  ? t('host.transport.playThis')
                  : t('host.transport.play')
              }
            >
              {Icons.play}
            </button>
          )}
          <button
            className={styles.tBtn}
            onClick={onNext}
            disabled={activeIndex + 1 >= queueLength}
            title={t('host.transport.next')}
          >
            {Icons.next}
          </button>
          <FullscreenToggle className={`${styles.tBtn} ${styles.tFullscreen}`} />
        </div>
      </div>
      <div className={styles.transportFooter}>
        <span className={styles.transportLogo}>KaraoQ</span>
        <a
          href="https://variationsonastring.com"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.transportLink}
        >
          {renderWithHeart(t('footer.credit'), styles.transportHeart)}
        </a>
        <FeedbackTrigger
          className={styles.transportFeedback}
          role="host"
          roomId={roomId}
        />
      </div>
    </div>
  );
}
