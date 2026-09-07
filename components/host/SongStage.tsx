import * as React from "react";
import styles from "../../styles/Host.module.css";
import { QueueEntry } from "../../pages/api/types";
import { useT } from "../../lib/i18n/I18nProvider";
import { EmptyStage } from "./EmptyStage";
import { StageLoading } from "./StageLoading";
import { embedSrc } from "../player/embed";
import { PlaybackErrorNotice } from "../player/PlaybackErrorNotice";
import { usePlaybackError } from "../player/usePlaybackError";
import { formatSongTitle } from "./utils";
import { AutoStartPanel } from "./AutoStartPanel";
import WrapUpPill from "../player/WrapUpPill";

// The main stage: the loading state, the current song's player/status panel (which
// varies by co-host / TV / here / other-device), and the empty-room states.
// Playback transport lives below in its own bar so there's one set of controls.
export function SongStage({
  loading,
  currentSong,
  songsSung,
  showCheer,
  lastSinger,
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
  joinCode,
  onAddFirst,
  autoStartIn,
  autoGapSeconds,
  autoEnabled,
  onOpenPlaybackSettings,
  wrapUpIn,
}: {
  loading: boolean;
  currentSong: QueueEntry | undefined;
  /** Entries behind the active index. With no current song, any history means
   * the queue drained mid-night rather than the room being brand new. */
  songsSung: number;
  showCheer: boolean;
  lastSinger: string | undefined;
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
  /** Only for the playback-error report; the join code itself is the
   * sidebar's job. */
  joinCode: string | undefined;
  onAddFirst: () => void;
  /** Seconds until auto-advance starts the waiting song; null = no countdown. */
  autoStartIn: number | null;
  autoGapSeconds: number;
  autoEnabled: boolean;
  onOpenPlaybackSettings?: () => void;
  /** Seconds until the song limit cuts the song; null outside the warning window. */
  wrapUpIn: number | null;
}) {
  const { t } = useT();
  const playbackFailed = usePlaybackError({
    videoRef,
    roomId: joinCode,
    entryId: currentSong?.id,
    videoId: currentSong?.videoId,
    active: !loading && !!currentSong && !remote && !tvMode && playsVideoHere,
  });
  const countdown =
    currentSong && !isPlaying ? (
      <AutoStartPanel
        secondsLeft={autoStartIn}
        gapSeconds={autoGapSeconds}
        autoEnabled={autoEnabled}
        showCheer={showCheer}
        songsSung={songsSung}
        lastSinger={lastSinger ?? ""}
        singerName={currentSong.userName}
        songTitle={formatSongTitle(currentSong.songTitle)}
        onOpenSettings={onOpenPlaybackSettings}
      />
    ) : null;
  const stageClass = `${styles.songControl} ${countdown ? styles.songControlStaged : ""}`;
  return loading ? (
    <StageLoading />
  ) : currentSong ? (
    remote ? (
      /* Co-host mode: status only, no player or audio. */
      <div className={stageClass}>
        {isPlaying && displayPaused ? (
          <div className={styles.readyLabel}>{t('host.status.pausedDisplay')}</div>
        ) : isPlaying ? (
          <div className={styles.liveIndicator}>
            <span className={styles.liveDot} />
            <span>{t('host.status.nowPlaying')}</span>
          </div>
        ) : countdown ? (
          countdown
        ) : (
          <div className={styles.readyLabel}>{t('host.status.upNext')}</div>
        )}
        {!countdown && (
          <>
            <h1 className={styles.controlSinger}>{currentSong.userName}</h1>
            <p className={styles.controlSong}>
              {formatSongTitle(currentSong.songTitle)}
            </p>
          </>
        )}
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
      <div className={stageClass}>
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
        ) : countdown ? (
          countdown
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
      <>
        <iframe
          ref={videoRef}
          key={currentSong.id}
          className={styles.video}
          src={embedSrc(currentSong.videoId, "autoplay=1&rel=0&enablejsapi=1")}
          allow="autoplay; encrypted-media"
          allowFullScreen
          onLoad={onIframeLoad}
        />
        {wrapUpIn !== null && !playbackFailed && <WrapUpPill secondsLeft={wrapUpIn} />}
        {playbackFailed && <PlaybackErrorNotice />}
      </>
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
      <div className={stageClass}>
        {countdown ?? (
          <>
            <div className={styles.readyLabel}>{t('host.status.upNext')}</div>
            <h1 className={styles.controlSinger}>{currentSong.userName}</h1>
            <p className={styles.controlSong}>
              {formatSongTitle(currentSong.songTitle)}
            </p>
          </>
        )}
      </div>
    )
  ) : (
    <EmptyStage
      variant={songsSung > 0 ? "more" : "first"}
      remote={remote}
      onAddSong={onAddFirst}
    />
  );
}
