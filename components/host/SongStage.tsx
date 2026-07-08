import * as React from "react";
import { QRCodeSVG } from "qrcode.react";
import styles from "../../styles/Host.module.css";
import { QueueEntry } from "../../pages/api/types";
import { useT } from "../../lib/i18n/I18nProvider";
import { Icons } from "./icons";
import { decodeHtml } from "./utils";

// The main stage: loading spinner, the current song's player/status panel (which
// varies by co-host / TV / here / other-device), and the empty-room states.
// Playback transport lives below in its own bar so there's one set of controls.
export function SongStage({
  loading,
  currentSong,
  remote,
  tvMode,
  isPlaying,
  displayPaused,
  displayConnected,
  playsVideoHere,
  videoRef,
  onIframeLoad,
  onOpenTvDisplay,
  onStartSong,
  joinUrl,
  displayUrl,
  joinCode,
  onPrintQr,
  onAddFirst,
}: {
  loading: boolean;
  currentSong: QueueEntry | undefined;
  remote: boolean;
  tvMode: boolean;
  isPlaying: boolean;
  displayPaused: boolean;
  displayConnected: boolean;
  playsVideoHere: boolean;
  videoRef: React.RefObject<HTMLIFrameElement>;
  onIframeLoad: () => void;
  onOpenTvDisplay: () => void;
  onStartSong: () => void;
  joinUrl: string;
  displayUrl: string;
  joinCode: string | undefined;
  onPrintQr: () => void;
  onAddFirst: () => void;
}) {
  const { t } = useT();
  return loading ? (
    <div className={styles.emptyState}>
      <div className={styles.spinner} />
      <p>{t('host.loadingRoom')}</p>
    </div>
  ) : currentSong ? (
    remote ? (
      /* Co-host mode: status only, no player or audio. */
      <div className={styles.songControl}>
        {isPlaying && displayPaused ? (
          <div className={styles.readyLabel}>{t('host.status.pausedDisplay')}</div>
        ) : isPlaying ? (
          <div className={styles.liveIndicator}>
            <span className={styles.liveDot} />
            <span>{t('host.status.nowPlaying')}</span>
          </div>
        ) : (
          <div className={styles.readyLabel}>{t('host.status.upNext')}</div>
        )}
        <h1 className={styles.controlSinger}>{currentSong.userName}</h1>
        <p className={styles.controlSong}>
          {decodeHtml(currentSong.songTitle)}
        </p>
        <p className={styles.cohostNote}>
          {t('host.cohost.playbackNote')}
        </p>
      </div>
    ) : tvMode ? (
      /* TV Display mode: status panel; playback runs from the
         transport bar so there's one set of controls. */
      <div className={styles.songControl}>
        {isPlaying && displayPaused ? (
          <>
            <div className={styles.readyLabel}>{t('host.status.pausedDisplay')}</div>
            <p className={styles.controlSinger}>
              {currentSong.userName}
            </p>
            <h2 className={styles.controlSong}>
              {decodeHtml(currentSong.songTitle)}
            </h2>
            <p className={styles.cohostNote}>
              {t('host.status.pausedDisplayNote')}
            </p>
          </>
        ) : isPlaying ? (
          <>
            <div className={styles.liveIndicator}>
              <span className={styles.liveDot} />
              <span>{t('host.status.playingDiffScreen')}</span>
            </div>
            <p className={styles.controlSinger}>
              {currentSong.userName}
            </p>
            <h2 className={styles.controlSong}>
              {decodeHtml(currentSong.songTitle)}
            </h2>
          </>
        ) : (
          <>
            <div className={styles.readyLabel}>{t('host.status.upNext')}</div>
            <h1 className={styles.controlSinger}>
              {currentSong.userName}
            </h1>
            <p className={styles.controlSong}>
              {decodeHtml(currentSong.songTitle)}
            </p>
          </>
        )}
        {!displayConnected && (
          <p className={styles.cohostNote}>
            {t('host.status.noDisplay')}
          </p>
        )}
        <button
          className={styles.switchModeLink}
          onClick={onOpenTvDisplay}
        >
          {displayConnected
            ? t('host.status.reopenDisplay')
            : t('host.status.openDisplay')}
        </button>
      </div>
    ) : /* All-in-one mode: video plays here. */
    playsVideoHere ? (
      <iframe
        ref={videoRef}
        key={currentSong.id}
        className={styles.video}
        src={`https://www.youtube.com/embed/${currentSong.videoId}?autoplay=1&rel=0&enablejsapi=1`}
        allow="autoplay; encrypted-media"
        allowFullScreen
        onLoad={onIframeLoad}
      />
    ) : isPlaying ? (
      /* Song is playing on a different host device: show status instead
         of double-playing it. Starting it here mints a new token, so the
         other device yields — a clean takeover. */
      <div className={styles.songControl}>
        <div className={styles.liveIndicator}>
          <span className={styles.liveDot} />
          <span>{t('host.status.playingOtherDevice')}</span>
        </div>
        <p className={styles.controlSinger}>{currentSong.userName}</p>
        <h2 className={styles.controlSong}>
          {decodeHtml(currentSong.songTitle)}
        </h2>
        <button className={styles.switchModeLink} onClick={onStartSong}>
          {t('host.status.playHereInstead')}
        </button>
      </div>
    ) : (
      <div className={styles.songControl}>
        <div className={styles.readyLabel}>{t('host.status.upNext')}</div>
        <h1 className={styles.controlSinger}>{currentSong.userName}</h1>
        <p className={styles.controlSong}>
          {decodeHtml(currentSong.songTitle)}
        </p>
      </div>
    )
  ) : remote ? (
    /* Co-host, empty queue. */
    <div className={styles.emptyState}>
      <h2 className={`${styles.emptyTitle} ${styles.emptyTitleBrand}`}>
        KaraoQ
      </h2>
      <p>
        {t('host.cohost.emptyQueue')}
      </p>
    </div>
  ) : (
    /* Host, empty queue: make the room playable right now. Adding the
       first song is the primary action; inviting guests to pile on is
       offered as a secondary step. */
    <div className={styles.emptyState}>
      <div className={styles.emptyStage}>
        <h2 className={styles.emptyTitle}>{t('host.empty.title')}</h2>
        <p className={styles.emptyStageLede}>
          {t('host.empty.lede')}
        </p>
        <button
          className={styles.emptyAddBtn}
          onClick={onAddFirst}
        >
          {Icons.plus} {t('host.empty.addFirst')}
        </button>
      </div>

      <div className={styles.emptyInvite}>
        <span className={styles.emptyInviteLabel}>
          {t('host.empty.inviteLabel')}
        </span>
        <div className={styles.emptyInviteRow}>
          {joinUrl && (
            <div className={styles.emptyInviteQr}>
              <QRCodeSVG
                value={joinUrl}
                size={92}
                bgColor="transparent"
                fgColor="#ffffff"
                level="M"
              />
            </div>
          )}
          <div className={styles.emptyInviteInfo}>
            <div className={styles.emptyJoinKicker}>
              {t('host.empty.scanVisit', { url: displayUrl })}
            </div>
            <div className={styles.emptyInviteCode}>
              {joinCode?.toUpperCase()}
            </div>
            <button className={styles.emptyJoinPrint} onClick={onPrintQr}>
              {t('host.empty.printCode')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
