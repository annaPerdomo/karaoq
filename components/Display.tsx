import * as React from 'react';
import { useRouter } from 'next/router';
import styles from '../styles/Display.module.css';
import getRoom from '../app/queue/getRoom';
import postVideoEnded from '../app/queue/postVideoEnded';
import postDisplaySeen from '../app/queue/postDisplaySeen';
import postDisplayGone from '../app/queue/postDisplayGone';
import reportDisplayPaused from '../app/queue/setDisplayPaused';
import setPlaying from '../app/queue/setPlaying';
import { normalizeRoomId } from '../lib/roomCode';
import { onRoomState, onDisplayPause, broadcastVideoEnded } from '../app/queue/roomChannel';
import { startSessionTracking } from '../app/queue/trackSession';
import { startVisiblePolling } from '../app/queue/pollWhileVisible';
import { isTextReaction } from '../app/queue/cheerConstants';
import { DEFAULT_DISPLAY_CONFIG, DisplayConfig, DisplayTheme, normalizeDisplayConfig, PlayMode, QueueEntry, Reaction, Room, SingWithMePost, SuggestedSong } from '../pages/api/types';
import { useT } from '../lib/i18n/I18nProvider';
import { renderWithHeart } from '../lib/i18n/renderWithHeart';
import LanguageSwitcher from './LanguageSwitcher';
import FullscreenToggle from './FullscreenToggle';
import formatSongTitle from '../lib/songTitle';
import { estimateQueue } from '../lib/queueTime';
import DisplaySidebar from './display/DisplaySidebar';
import NowPlayingBar from './display/NowPlayingBar';
import p from '../styles/DisplayDesigner.module.css';
import { useDisplayEdit } from './display/edit/useDisplayEdit';
import { Spot, HideButton } from './edit/EditChrome';
import { ConfigRail } from './edit/ConfigRail';
import { displayRailToggles } from './display/edit/railToggles';
import { EditOverlay } from './edit/EditOverlay';
import { SAMPLE_QUEUE } from './display/edit/sampleContent';
import { Icons } from './host/icons';

const POLL_INTERVAL = 1500;
// Server treats a display as gone after ~75s without a heartbeat.
const HEARTBEAT_INTERVAL = 10_000;

const THEME_CLASS: Record<DisplayTheme, string> = {
  classic: '',
  minimal: styles.themeMinimal,
  neon: styles.themeNeon,
};

const Display = (): React.ReactElement => {
  const router = useRouter();
  const { t } = useT();
  const joinCode = normalizeRoomId(router.query.joinCode) as string | undefined;

  const [queue, setQueue] = React.useState<QueueEntry[]>([]);
  const [singWithMe, setSingWithMe] = React.useState<SingWithMePost[]>([]);
  const [suggestions, setSuggestions] = React.useState<SuggestedSong[]>([]);
  const [boardsOn, setBoardsOn] = React.useState(true);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [isPlaying, setIsPlaying] = React.useState(false);
  // Lets the on-stage song count down instead of restarting the queue-time
  // estimate on every poll.
  const [playStartedAt, setPlayStartedAt] = React.useState<string | null>(null);
  const [playPausedAt, setPlayPausedAt] = React.useState<string | null>(null);
  const [displayPaused, setDisplayPaused] = React.useState(false);
  // Unset playMode (legacy rooms) is treated like "tv".
  const [playMode, setPlayMode] = React.useState<PlayMode | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [loadError, setLoadError] = React.useState(false);
  const notFoundPollsRef = React.useRef(0);
  const [origin, setOrigin] = React.useState('');
  const [reactionsOn, setReactionsOn] = React.useState(true);
  const [displayConfig, setDisplayConfig] = React.useState<DisplayConfig>(DEFAULT_DISPLAY_CONFIG);
  const [visibleReactions, setVisibleReactions] = React.useState<(Reaction & { key: string; left: number; sway: number })[]>([]);
  const seenReactionIds = React.useRef(new Set<string>());
  const reactionTimers = React.useRef<ReturnType<typeof setTimeout>[]>([]);
  const videoRef = React.useRef<HTMLIFrameElement>(null);

  const [needsTap, setNeedsTap] = React.useState(false);
  const playbackConfirmedRef = React.useRef(false);
  const unlockRetryRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // YouTube sends both onStateChange and infoDelivery for the same end event.
  const endedHandledRef = React.useRef(false);
  const pausedReportedRef = React.useRef(false);
  // Shields applyRoom from a lagging poll that predates the server write; expires after 3s.
  const localPauseRef = React.useRef<{ paused: boolean; at: number } | null>(null);

  React.useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  React.useEffect(() => {
    if (!joinCode) return;
    return startSessionTracking(joinCode, 'Display', 'display');
  }, [joinCode]);

  // Heartbeat ticks from a Web Worker: hidden-tab window timers are throttled
  // (Chrome: ~1/min), which starved the beat while audio kept playing.
  React.useEffect(() => {
    if (!joinCode || error) return;
    const beat = () => postDisplaySeen(joinCode).catch(() => {});
    beat();

    let stopTicker: () => void;
    try {
      const src = `setInterval(() => postMessage(0), ${HEARTBEAT_INTERVAL});`;
      const url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
      const worker = new Worker(url);
      URL.revokeObjectURL(url);
      worker.onmessage = beat;
      stopTicker = () => worker.terminate();
    } catch {
      const interval = setInterval(beat, HEARTBEAT_INTERVAL);
      stopTicker = () => clearInterval(interval);
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') beat();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Beacon so a cross-device host can fall back without waiting out the heartbeat TTL.
    const onPageHide = () => postDisplayGone(joinCode);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      stopTicker();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [joinCode, error]);

  React.useEffect(() => {
    const timers = reactionTimers.current;
    return () => {
      timers.forEach(clearTimeout);
    };
  }, []);

  // animate=false on initial load only seeds the seen-set — otherwise a refresh
  // replays the last 30s of cheers at once.
  function processReactions(reactions: Reaction[] | undefined, animate = true) {
    if (!reactions || reactions.length === 0) return;
    const fresh = reactions.filter((r) => !seenReactionIds.current.has(r.id));
    if (fresh.length === 0) return;
    fresh.forEach((r) => seenReactionIds.current.add(r.id));
    if (seenReactionIds.current.size > 200) {
      const entries = Array.from(seenReactionIds.current);
      seenReactionIds.current = new Set(entries.slice(-100));
    }
    if (!animate) return;
    const withKeys = fresh.map((r) => ({
      ...r,
      key: r.id,
      left: 5 + Math.random() * 85,
      sway: Math.random() * 80 - 40,
    }));
    setVisibleReactions((prev) => [...prev, ...withKeys]);
    const timer = setTimeout(() => {
      const ids = new Set(fresh.map((r) => r.id));
      setVisibleReactions((prev) => prev.filter((r) => !ids.has(r.key)));
    }, 4700);
    reactionTimers.current.push(timer);
  }

  function applyRoom(room: Room, animateReactions = true) {
    setQueue(room.queue);
    setSingWithMe(room.singWithMe ?? []);
    setSuggestions(room.suggestions ?? []);
    setBoardsOn(room.boardsOnDisplay ?? true);
    setActiveIndex(room.activeVideoIndex);
    setIsPlaying(room.isPlaying ?? false);
    setPlayStartedAt(
      room.playStartedAt ? new Date(room.playStartedAt).toISOString() : null
    );
    setPlayPausedAt(
      room.playPausedAt ? new Date(room.playPausedAt).toISOString() : null
    );
    let paused = room.displayPaused ?? false;
    const local = localPauseRef.current;
    if (local && paused !== local.paused && Date.now() - local.at < 3000) {
      paused = local.paused;
    }
    setDisplayPaused(paused);
    setPlayMode(room.playMode ?? null);
    setReactionsOn(room.reactionsEnabled ?? true);
    setDisplayConfig(normalizeDisplayConfig(room.displayConfig));
    processReactions(room.reactions, animateReactions);
  }

  const playsVideoHere = playMode !== 'here';

  const edit = useDisplayEdit({
    joinCode,
    config: displayConfig,
    boardsOn,
    onSaved: (nextConfig, nextBoards) => {
      setDisplayConfig(nextConfig);
      setBoardsOn(nextBoards);
    },
  });

  React.useEffect(() => {
    if (!joinCode) return;

    let cancelled = false;

    async function init() {
      let room = await getRoom(joinCode!, { display: true });
      if (cancelled) return;
      if (room === "notFound") {
        setError(t('display.errorTitle'));
      } else if (room === "error") {
        setLoadError(true);
      } else {
        // A TV display loading fresh proves recorded playback is stale — clear it rather
        // than blast a song. Skip if another display's heartbeat is live, or in here-mode.
        if (room.isPlaying && room.playMode !== 'here' && !room.displayConnected) {
          await setPlaying(joinCode!, false);
          room = { ...room, isPlaying: false };
        }
        if (cancelled) return;
        applyRoom(room, false);
        setLoadError(false);
      }
      setLoading(false);
    }

    init();
    return () => { cancelled = true; };
  }, [joinCode]);

  React.useEffect(() => {
    if (!joinCode) return;
    return onRoomState(joinCode, (state) => {
      setQueue(state.queue);
      setActiveIndex(state.activeVideoIndex);
      setIsPlaying(state.isPlaying);
      setReactionsOn(state.reactionsEnabled);
      if (state.displayConfig) setDisplayConfig(normalizeDisplayConfig(state.displayConfig));
      processReactions(state.reactions);
    });
  }, [joinCode]);

  React.useEffect(() => {
    if (!joinCode) return;
    return onDisplayPause(joinCode, (paused) => {
      localPauseRef.current = { paused, at: Date.now() };
      setDisplayPaused(paused);
    });
  }, [joinCode]);

  React.useEffect(() => {
    if (!joinCode || error) return;

    return startVisiblePolling(async () => {
      const room = await getRoom(joinCode, { display: true });
      if (room === "error") return;
      if (room === "notFound") {
        notFoundPollsRef.current += 1;
        if (notFoundPollsRef.current >= 3) setError(t('display.errorTitle'));
        return;
      }
      notFoundPollsRef.current = 0;
      applyRoom(room);
      setLoadError(false);
      setLoading(false);
    }, POLL_INTERVAL);
  }, [joinCode, error]);

  const currentSongId = queue[activeIndex]?.id;

  // A replay of the same song (isPlaying toggle) needs its end reported again.
  React.useEffect(() => {
    endedHandledRef.current = false;
    pausedReportedRef.current = false;
  }, [currentSongId, isPlaying]);

  React.useEffect(() => {
    if (!isPlaying || !joinCode || !playsVideoHere) return;
    const roomId = joinCode;
    const endedIndex = activeIndex;

    async function reportVideoEnded() {
      if (endedHandledRef.current) return;
      endedHandledRef.current = true;
      await postVideoEnded(roomId, endedIndex);
      const room = await getRoom(roomId, { display: true });
      if (typeof room !== "string") applyRoom(room);
      broadcastVideoEnded(roomId);
    }

    function onMessage(e: MessageEvent) {
      if (e.origin !== 'https://www.youtube.com') return;
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        const state =
          data.event === 'onStateChange'
            ? data.info
            : data.event === 'infoDelivery'
              ? data.info?.playerState
              : undefined;
        if (state === 0) {
          reportVideoEnded();
        } else if (state === 1 || state === 3) {
          // Playing or buffering.
          playbackConfirmedRef.current = true;
          setNeedsTap(false);
          if (pausedReportedRef.current) {
            pausedReportedRef.current = false;
            localPauseRef.current = { paused: false, at: Date.now() };
            reportDisplayPaused(roomId, false);
          }
        } else if (state === 2) {
          // Paused. Report once per pause, and only after playback confirmed —
          // scrubbing and pre-start states also pass through 2.
          if (playbackConfirmedRef.current && !pausedReportedRef.current) {
            pausedReportedRef.current = true;
            localPauseRef.current = { paused: true, at: Date.now() };
            reportDisplayPaused(roomId, true);
          }
        }
      } catch {}
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [isPlaying, joinCode, activeIndex, playsVideoHere]);

  // If YouTube hasn't reported playing shortly after mount, autoplay was blocked.
  React.useEffect(() => {
    if (!isPlaying || !currentSongId || !playsVideoHere) {
      setNeedsTap(false);
      return;
    }
    playbackConfirmedRef.current = false;
    const timer = setTimeout(() => {
      if (!playbackConfirmedRef.current) setNeedsTap(true);
    }, 3000);
    return () => {
      clearTimeout(timer);
      if (unlockRetryRef.current) clearTimeout(unlockRetryRef.current);
    };
  }, [isPlaying, currentSongId, playsVideoHere]);

  // Drive the player to match the polled pause flag when they disagree
  // (host paused/resumed from another device).
  React.useEffect(() => {
    if (!isPlaying || !playsVideoHere || !playbackConfirmedRef.current) return;
    const player = videoRef.current?.contentWindow;
    if (!player) return;
    if (displayPaused && !pausedReportedRef.current) {
      player.postMessage(
        JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }),
        'https://www.youtube.com'
      );
    } else if (!displayPaused && pausedReportedRef.current) {
      player.postMessage(
        JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
        'https://www.youtube.com'
      );
    }
  }, [displayPaused, isPlaying, playsVideoHere]);

  // The tap grants sticky user activation — this song and all later ones can
  // now autoplay with sound.
  function unlockPlayback() {
    videoRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
      'https://www.youtube.com'
    );
    setNeedsTap(false);
    if (unlockRetryRef.current) clearTimeout(unlockRetryRef.current);
    unlockRetryRef.current = setTimeout(() => {
      if (!playbackConfirmedRef.current) setNeedsTap(true);
    }, 2000);
  }

  function handleIframeLoad() {
    videoRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'listening', id: 'karaoq-display' }),
      'https://www.youtube.com'
    );
  }

  const currentSong = queue[activeIndex];
  const upNext = currentSong && !isPlaying
    ? queue.slice(activeIndex)
    : queue.slice(activeIndex + 1);
  // Recomputed each render; the 1.5s poll is what advances the countdown.
  const estimate = estimateQueue({
    queue,
    activeVideoIndex: activeIndex,
    isPlaying,
    playStartedAt,
    playPausedAt,
  });
  const joinUrl = `${origin || 'https://karaoq.live'}/sing/${joinCode}`;
  const view = edit.view;
  // boardsView, not raw boardsOn: after a save that hides boards, the raw flag
  // lags until the poll echoes.
  const sidebarCollapsed =
    !edit.editing &&
    view.qrSize === 'hidden' &&
    !view.showUpNext &&
    !view.bannerLine &&
    !edit.boardsView;

  if (!joinCode) {
    return <div className={styles.loading}><div className={styles.spinner} /></div>;
  }

  if (error) {
    return (
      <main className={styles.main}>
        <div className={styles.errorState}>
          <h2>{t('display.errorTitle')}</h2>
          <p>{t('display.errorBody')}</p>
        </div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className={styles.main}>
        <div className={styles.errorState}>
          <h2>{t('common.connectionErrorTitle')}</h2>
          <p>{t('common.connectionErrorBody')}</p>
        </div>
      </main>
    );
  }

  const themeClass = THEME_CLASS[view.theme];
  const sideClass =
    !sidebarCollapsed && view.sidebarPosition === 'left' ? styles.sidebarLeft : '';
  const editSideClass = edit.editing && view.sidebarPosition === 'left' ? p.edLeft : '';

  return (
    <main
      className={`${styles.main} ${themeClass} ${sideClass} ${editSideClass}`}
      style={{
        '--sb-w': `${view.sidebarWidth}px`,
        '--now-h': `${view.nowPlayingHeight}px`,
        // CSS can't divide two px lengths into a unitless number, so the type
        // scale ratio is computed here.
        '--now-scale': `${view.nowPlayingHeight / DEFAULT_DISPLAY_CONFIG.nowPlayingHeight}`,
      } as React.CSSProperties}
      onClick={edit.editing ? () => edit.setSelected(null) : undefined}
    >
      <header className={`${styles.header} ${sidebarCollapsed ? styles.headerNoSidebar : ''}`}>
        <div className={styles.brand}>KaraoQ</div>
        <div className={styles.headerActions}>
          {!edit.editing && !loading && (
            <button
              className={styles.headerEdit}
              onClick={edit.enter}
              title={t('customize.button')}
            >
              {Icons.brush}
              <span>{t('customize.button')}</span>
            </button>
          )}
          <LanguageSwitcher className={styles.headerLang} />
        </div>
      </header>

      <div className={`${styles.videoArea} ${sidebarCollapsed ? styles.videoAreaNoSidebar : ''}`}>
        {loading ? (
          <div className={styles.centerState}>
            <div className={styles.spinner} />
          </div>
        ) : currentSong && isPlaying && playsVideoHere ? (
          <iframe
            ref={videoRef}
            key={currentSong.id}
            className={styles.video}
            src={`https://www.youtube.com/embed/${currentSong.videoId}?autoplay=1&rel=0&modestbranding=1&iv_load_policy=3&enablejsapi=1`}
            allow="autoplay; encrypted-media"
            allowFullScreen
            onLoad={handleIframeLoad}
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

        {needsTap && isPlaying && currentSong && (
          <button className={styles.tapOverlay} onClick={unlockPlayback}>
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

        {reactionsOn && visibleReactions.length > 0 && (
          <div className={styles.reactionOverlay}>
            {visibleReactions.map((r) => (
              <div
                key={r.key}
                className={styles.reactionBubble}
                style={{ left: `${r.left}%`, '--sway': `${r.sway}px` } as React.CSSProperties}
              >
                {isTextReaction(r.emoji) ? (
                  <span className={styles.reactionText}>{r.emoji}</span>
                ) : (
                  <span className={styles.reactionEmoji}>{r.emoji}</span>
                )}
              </div>
            ))}
          </div>
        )}

      </div>

      {edit.editing ? (
        view.showNowPlaying ? (
          <Spot
            id="nowPlaying"
            selected={edit.selected}
            onSelect={edit.setSelected}
            label={t('customize.nowPlaying')}
            className={p.nowSlot}
            positioned
            chrome={
              <>
                <div className={p.chrome}>
                  <HideButton
                    title={t('customize.hide')}
                    onHide={() => edit.change({ showNowPlaying: false })}
                  />
                </div>
                <button
                  className={p.heightHandle}
                  title={t('customize.dragHeight')}
                  aria-label={t('customize.dragHeight')}
                  {...edit.heightDragProps}
                />
              </>
            }
          >
            <NowPlayingBar
              singerName={currentSong?.userName ?? SAMPLE_QUEUE[0].userName}
              songTitle={currentSong?.songTitle ?? SAMPLE_QUEUE[0].songTitle}
            />
          </Spot>
        ) : (
          <button
            className={`${p.ghost} ${p.ghostStrip}`}
            onClick={(e) => {
              e.stopPropagation();
              edit.change({ showNowPlaying: true });
              edit.setSelected('nowPlaying');
            }}
          >
            {t('customize.hiddenTap', { section: t('customize.nowPlaying') })}
          </button>
        )
      ) : (
        currentSong && isPlaying && playsVideoHere && view.showNowPlaying && (
          <NowPlayingBar singerName={currentSong.userName} songTitle={currentSong.songTitle} />
        )
      )}

      <div className={styles.footer}>
        <span className={styles.footerLogo}>KaraoQ</span>
        <a href="https://variationsonastring.com" target="_blank" rel="noopener noreferrer" className={styles.footerLink}>
          {renderWithHeart(t('footer.credit'), styles.footerHeart)}
        </a>
      </div>

      {!edit.editing && (
        <FullscreenToggle
          className={`${styles.videoFullscreen} ${
            sidebarCollapsed || view.sidebarPosition === 'left'
              ? styles.videoFullscreenFarSide
              : ''
          }`}
        />
      )}

      {!sidebarCollapsed && (
        <DisplaySidebar
          joinUrl={joinUrl}
          joinCode={joinCode || ''}
          origin={origin}
          upNext={upNext}
          // Not while customizing: the list renders sample songs there, and a
          // countdown against invented content would read as real.
          estimate={edit.editing ? undefined : estimate}
          boardsOn={edit.boardsView}
          singWithMe={singWithMe}
          suggestions={suggestions}
          displayConfig={view}
          edit={
            edit.editing
              ? {
                  selected: edit.selected,
                  onSelect: edit.setSelected,
                  onChange: edit.change,
                  onToggleBoards: edit.toggleBoards,
                  dragging: edit.sideDragTarget !== null,
                  dragHandleProps: edit.sideDragProps,
                  widthDragProps: edit.widthDragProps,
                }
              : undefined
          }
        />
      )}

      {edit.editing && (
        <EditOverlay
          rail={
            <ConfigRail
              side={view.sidebarPosition === 'right' ? 'left' : 'right'}
              hintKey="customize.hint.display"
              theme={view.theme}
              onPickTheme={(theme) => edit.change({ theme })}
              toggles={displayRailToggles(
                view,
                edit.change,
                edit.boardsView,
                edit.toggleBoards
              )}
              bannerId="banner"
              bannerLine={view.bannerLine}
              onBannerChange={(bannerLine) => edit.change({ bannerLine })}
              selected={edit.selected}
              onSelect={edit.setSelected}
            />
          }
          dirty={edit.dirty}
          saving={edit.saving}
          saveFailed={edit.saveFailed}
          onDiscard={edit.discard}
          onSave={edit.save}
          sideDragTarget={edit.sideDragTarget}
        />
      )}
    </main>
  );
};

export default Display;
