import * as React from 'react';
import { useRouter } from 'next/router';
import styles from '../styles/MusicVideo.module.css';
import getRoom from '../app/queue/getRoom';
import postScreenEvent from '../app/queue/screenEvent';
import { normalizeRoomId } from '../lib/roomCode';
import { onRoomState, onDisplayPause } from '../app/queue/roomChannel';
import { startVisiblePolling } from '../app/queue/pollWhileVisible';
import { DORMANT_POLL_MS, isRoomDormant } from '../lib/roomDormancy';
import { useT } from '../lib/i18n/I18nProvider';
import { DEFAULT_DISPLAY_CONFIG, DisplayTheme, QueueEntry, Room, RoomBrand, normalizeDisplayConfig, roomTheme } from '../pages/api/types';
import { brandStyle } from '../lib/brandStyle';
import MusicVideoLockup from './musicvideo/MusicVideoLockup';
import MusicVideoPlayer from './musicvideo/MusicVideoPlayer';
import MusicVideoIdle from './musicvideo/MusicVideoIdle';
import MusicVideoQrCorner from './musicvideo/MusicVideoQrCorner';
import { useOriginalVideo } from './musicvideo/hooks/useOriginalVideo';
import { useEntryOffset } from './musicvideo/hooks/useEntryOffset';
import { useVideoSync } from './musicvideo/hooks/useVideoSync';

const MUSIC_VIDEO_POLL_MS = 3000;
const THEME_CLASS: Record<DisplayTheme, string> = {
  classic: '',
  minimal: styles.themeMinimal,
  neon: styles.themeNeon,
};
const OFFSET_STEP_S = 0.5;
const OFFSET_SHOW_MS = 1500;
// Same threshold Display uses before treating repeated 404s as the room being gone.
const NOT_FOUND_POLL_LIMIT = 3;

export default function MusicVideoScreen(): React.ReactElement {
  const router = useRouter();
  const { t } = useT();
  const joinCode = normalizeRoomId(router.query.joinCode) as string | undefined;

  const [queue, setQueue] = React.useState<QueueEntry[]>([]);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [displayPaused, setDisplayPaused] = React.useState(false);
  const [playStartedAt, setPlayStartedAt] = React.useState<string | null>(null);
  const [playPausedAt, setPlayPausedAt] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);
  const [brand, setBrand] = React.useState<RoomBrand>({});
  const [theme, setTheme] = React.useState<DisplayTheme>('classic');
  const [qrHidden, setQrHidden] = React.useState(false);
  const [qrPx, setQrPx] = React.useState(DEFAULT_DISPLAY_CONFIG.qrPx);

  const videoRef = React.useRef<HTMLIFrameElement>(null);
  const dormantRef = React.useRef(false);
  const notFoundPollsRef = React.useRef(0);

  const [offsetS, setOffsetS] = React.useState(0);
  const [showOffset, setShowOffset] = React.useState(false);
  const offsetHideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const openedSentRef = React.useRef(false);
  const startedAtRef = React.useRef(Date.now());
  const shownIdsRef = React.useRef(new Set<string>());
  const unavailableIdsRef = React.useRef(new Set<string>());

  function applyRoom(room: Room) {
    dormantRef.current = isRoomDormant(room);
    setQueue(room.queue);
    setActiveIndex(room.activeVideoIndex);
    setIsPlaying(room.isPlaying ?? false);
    setDisplayPaused(room.displayPaused ?? false);
    setPlayStartedAt((room.playStartedAt as unknown as string | null) ?? null);
    setPlayPausedAt((room.playPausedAt as unknown as string | null) ?? null);
    setBrand(room.brand ?? {});
    setTheme(roomTheme(room));
    const displayConfig = normalizeDisplayConfig(room.displayConfig);
    setQrHidden(displayConfig.qrSize === 'hidden');
    setQrPx(displayConfig.qrPx);
  }

  // Never passes { display: true } — this screen is a viewer, not the heartbeat.
  React.useEffect(() => {
    if (!joinCode) return;
    let cancelled = false;
    (async () => {
      const room = await getRoom(joinCode, { musicVideo: true });
      if (cancelled) return;
      if (room === 'notFound') {
        setNotFound(true);
      } else if (room !== 'error') {
        applyRoom(room);
        if (!openedSentRef.current) {
          openedSentRef.current = true;
          postScreenEvent(joinCode, 'music_video_screen_opened', {});
        }
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [joinCode]);

  // Stops polling once notFound is set, same as Display — a gone room has
  // nothing left to poll for.
  React.useEffect(() => {
    if (!joinCode || notFound) return;
    return startVisiblePolling(async () => {
      const room = await getRoom(joinCode, { musicVideo: true });
      if (room === 'error') return;
      if (room === 'notFound') {
        notFoundPollsRef.current += 1;
        if (notFoundPollsRef.current >= NOT_FOUND_POLL_LIMIT) setNotFound(true);
        return;
      }
      notFoundPollsRef.current = 0;
      applyRoom(room);
    }, () => (dormantRef.current ? DORMANT_POLL_MS : MUSIC_VIDEO_POLL_MS));
  }, [joinCode, notFound]);

  React.useEffect(() => {
    if (!joinCode) return;
    return onRoomState(joinCode, (state) => {
      setQueue(state.queue);
      setActiveIndex(state.activeVideoIndex);
      setIsPlaying(state.isPlaying);
      setPlayStartedAt(state.playStartedAt ?? null);
      setPlayPausedAt(null);
    });
  }, [joinCode]);

  React.useEffect(() => {
    if (!joinCode) return;
    return onDisplayPause(joinCode, setDisplayPaused);
  }, [joinCode]);

  const currentEntry = queue[activeIndex];
  const nextEntry = queue[activeIndex + 1];
  const currentEntryId = currentEntry?.id ?? null;

  const { videoId, status, fail } = useOriginalVideo(
    joinCode,
    currentEntryId,
    nextEntry?.id ?? null,
    currentEntry?.originalVideoId ?? null
  );
  const thumbnailId = status === 'ok' ? videoId : null;
  const entryOffsetS = useEntryOffset(joinCode, currentEntryId, currentEntry?.originalOffsetSeconds ?? 0);
  const effectiveOffsetS = entryOffsetS + offsetS;

  React.useEffect(() => {
    setOffsetS(0);
  }, [currentEntryId]);

  React.useEffect(() => {
    if (currentEntryId && (status === 'none' || status === 'quota')) {
      unavailableIdsRef.current.add(currentEntryId);
    }
  }, [currentEntryId, status]);

  const { ended, paused, onInfo } = useVideoSync({
    roomId: joinCode,
    entryId: currentEntryId,
    videoRef,
    isPlaying,
    displayPaused,
    playStartedAt,
    playPausedAt,
    offsetS: effectiveOffsetS,
  });

  const idle = !currentEntry || !isPlaying || status !== 'ok' || !videoId || ended;
  const unavailable = isPlaying && (status === 'none' || status === 'quota' || ended || (status === 'ok' && !videoId));

  function handleInfo(currentTime: number | null, state: number | undefined, duration: number | null) {
    onInfo(currentTime, state, duration);
    if (state === 1 && currentEntryId) shownIdsRef.current.add(currentEntryId);
  }

  function handleError(code: number) {
    if (joinCode) postScreenEvent(joinCode, 'music_video_error', { code });
    fail();
  }

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      setOffsetS((prev) => prev + (e.key === 'ArrowRight' ? OFFSET_STEP_S : -OFFSET_STEP_S));
      setShowOffset(true);
      if (offsetHideTimer.current) clearTimeout(offsetHideTimer.current);
      offsetHideTimer.current = setTimeout(() => setShowOffset(false), OFFSET_SHOW_MS);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Must stay above the effect that updates prevOffsetRef: same-commit effects run
  // in declaration order, so the ref still holds the outgoing entry's offset here.
  const prevEntryIdRef = React.useRef<string | null>(null);
  const prevOffsetRef = React.useRef(0);
  React.useEffect(() => {
    if (
      joinCode &&
      prevEntryIdRef.current &&
      prevEntryIdRef.current !== currentEntryId &&
      prevOffsetRef.current !== 0
    ) {
      postScreenEvent(joinCode, 'music_video_offset', { offsetSeconds: prevOffsetRef.current });
    }
    prevEntryIdRef.current = currentEntryId;
  }, [currentEntryId, joinCode]);
  React.useEffect(() => {
    prevOffsetRef.current = effectiveOffsetS;
  }, [effectiveOffsetS]);

  React.useEffect(() => {
    if (!joinCode) return;
    function onPageHide() {
      postScreenEvent(joinCode as string, 'music_video_screen_closed', {
        durationSeconds: Math.round((Date.now() - startedAtRef.current) / 1000),
        songsShown: shownIdsRef.current.size,
        songsUnavailable: unavailableIdsRef.current.size,
      });
    }
    // bfcache restore: pagehide already sent the closed event, so this is a new session.
    function onPageShow(e: PageTransitionEvent) {
      if (!e.persisted) return;
      startedAtRef.current = Date.now();
      shownIdsRef.current.clear();
      unavailableIdsRef.current.clear();
    }
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [joinCode]);

  if (!joinCode || loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
      </div>
    );
  }

  if (notFound) {
    return (
      <main className={styles.main}>
        <div className={styles.errorState}>
          <h2>{t('display.errorTitle')}</h2>
          <p>{t('display.errorBody')}</p>
        </div>
      </main>
    );
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const joinUrl = `${origin || 'https://karaoq.live'}/sing/${joinCode}`;

  return (
    <main className={`${styles.main} ${THEME_CLASS[theme]}`} style={brandStyle(brand) as React.CSSProperties}>
      {!idle && videoId && (
        <MusicVideoPlayer videoId={videoId} videoRef={videoRef} onInfo={handleInfo} onError={handleError} />
      )}
      {!idle && paused && <div className={styles.pausedScrim} />}
      {!idle && currentEntry?.userName && (
        <div className={styles.onStage}>
          <span className={styles.onStageTag}>{t('display.tag.onStage')}</span>
          <span className={styles.onStageName}>{currentEntry.userName}</span>
        </div>
      )}
      <MusicVideoLockup joinCode={joinCode} logo={brand.logo} />
      {idle && (
        <MusicVideoIdle
          singerName={currentEntry?.userName}
          songTitle={currentEntry?.songTitle}
          reason={unavailable ? 'unavailable' : 'waiting'}
          thumbnailId={thumbnailId}
        />
      )}
      {!qrHidden && (
        <MusicVideoQrCorner joinUrl={joinUrl} joinCode={joinCode} origin={origin} qrPx={qrPx} />
      )}
      {showOffset && (
        <div className={styles.offsetPill}>{t('musicVideo.offset', { seconds: effectiveOffsetS })}</div>
      )}
    </main>
  );
}
