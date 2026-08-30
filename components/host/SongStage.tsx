import * as React from "react";
import styles from "../../styles/Host.module.css";
import { QueueEntry } from "../../pages/api/types";
import { useT } from "../../lib/i18n/I18nProvider";
import { Icons } from "./icons";
import { InviteBlock } from "./InviteBlock";
import { formatSongTitle } from "./utils";

// The main stage: loading spinner, the current song's player/status panel (which
// varies by co-host / TV / here / other-device), and the empty-room states.
// Playback transport lives below in its own bar so there's one set of controls.
export function SongStage({
  loading,
  currentSong,
  songsSung,
  remote,
  cohostCanPlay,
  cohostControlsLive,
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
  /** Entries behind the active index. With no current song, any history means
   * the queue drained mid-night rather than the room being brand new. */
  songsSung: number;
  remote: boolean;
  /** Host.tsx's gates for the co-host's Play and Pause — shared with the
   * transport bar so the note and the buttons can't disagree. */
  cohostCanPlay: boolean;
  cohostControlsLive: boolean;
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
  const { t, tn } = useT();
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
          {formatSongTitle(currentSong.songTitle)}
        </p>
        {/* Shown whenever the bar has no playback button, which is what the note
            explains. A here-mode co-host has Play while stopped (so the note
            would contradict it) but not Pause once a song runs, and an empty
            middle slot with no explanation reads as a bug. */}
        {(isPlaying ? !cohostControlsLive : !cohostCanPlay) && (
          <p className={styles.cohostNote}>
            {t('host.cohost.playbackNote')}
          </p>
        )}
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
              {formatSongTitle(currentSong.songTitle)}
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
              {formatSongTitle(currentSong.songTitle)}
            </h2>
          </>
        ) : (
          <>
            <div className={styles.readyLabel}>{t('host.status.upNext')}</div>
            <h1 className={styles.controlSinger}>
              {currentSong.userName}
            </h1>
            <p className={styles.controlSong}>
              {formatSongTitle(currentSong.songTitle)}
            </p>
          </>
        )}
        {!displayConnected && (
          <p className={styles.cohostNote}>
            {t('host.status.noDisplay')}
          </p>
        )}
        {/* Only offer to (re)open while no display is live — opening a
            second one on top of a connected display double-plays the song. */}
        {!displayConnected && (
          <button
            className={styles.switchModeLink}
            onClick={onOpenTvDisplay}
          >
            {t('host.status.openDisplay')}
          </button>
        )}
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
          {formatSongTitle(currentSong.songTitle)}
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
          {formatSongTitle(currentSong.songTitle)}
        </p>
      </div>
    )
  ) : songsSung > 0 ? (
    <div className={`${styles.emptyState} ${styles.emptyStateFinished}`}>
      <div className={styles.emptyStage}>
        <h2 className={styles.emptyTitle}>{t('host.finished.title')}</h2>
        <p className={styles.emptyStageLede}>
          {tn('host.finished.sung', songsSung)}
        </p>
        {remote ? (
          <p className={styles.cohostNote}>{t('host.finished.cohostAdd')}</p>
        ) : (
          <button
            className={styles.emptyAddBtn}
            onClick={onAddFirst}
          >
            {Icons.plus} {t('host.finished.addAnother')}
          </button>
        )}
      </div>

      {!remote && (
        <InviteBlock
          joinUrl={joinUrl}
          displayUrl={displayUrl}
          joinCode={joinCode}
          onPrintQr={onPrintQr}
        />
      )}
    </div>
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

      <InviteBlock
        joinUrl={joinUrl}
        displayUrl={displayUrl}
        joinCode={joinCode}
        onPrintQr={onPrintQr}
      />
    </div>
  );
}
