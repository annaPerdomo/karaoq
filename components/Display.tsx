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
import DisplaySidebar from './display/DisplaySidebar';
import NowPlayingBar from './display/NowPlayingBar';
import AttractPanel from './display/AttractPanel';

const POLL_INTERVAL = 1500;
// Liveness heartbeat cadence; the server treats a display as gone after ~75s
// without one and clears any playback that display was supposed to be running.
const HEARTBEAT_INTERVAL = 10_000;

const THEME_CLASS: Record<DisplayTheme, string> = {
  classic: '',
  minimal: styles.themeMinimal,
  neon: styles.themeNeon,
  sunset: styles.themeSunset,
  ocean: styles.themeOcean,
  gold: styles.themeGold,
  forest: styles.themeForest,
  pastel: styles.themePastel,
  party: styles.themeParty,
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
  // The room's shared pause flag. Set when the video is paused on this screen
  // (reported by the player watcher below) OR when the host pauses from their
  // controls; either way this screen is the single place the video lives, so it
  // reconciles its player to match.
  const [displayPaused, setDisplayPaused] = React.useState(false);
  // In "here" mode the host page is the playback surface — this screen shows
  // the queue and an on-stage banner instead of double-playing the video.
  // Unset playMode (legacy rooms) is treated like "tv" so old setups keep
  // working.
  const [playMode, setPlayMode] = React.useState<PlayMode | null>(null);
  const [loading, setLoading] = React.useState(true);
  // Definitive "room doesn't exist" — terminal, stops polling.
  const [error, setError] = React.useState<string | null>(null);
  // Transient load failure — the poll keeps running and heals it on the
  // first successful fetch (a TV rarely has a pointer to click retry with).
  const [loadError, setLoadError] = React.useState(false);
  const notFoundPollsRef = React.useRef(0);
  const [origin, setOrigin] = React.useState('');
  const [reactionsOn, setReactionsOn] = React.useState(true);
  const [displayConfig, setDisplayConfig] = React.useState<DisplayConfig>(DEFAULT_DISPLAY_CONFIG);
  const [visibleReactions, setVisibleReactions] = React.useState<(Reaction & { key: string; left: number; sway: number })[]>([]);
  const seenReactionIds = React.useRef(new Set<string>());
  const reactionTimers = React.useRef<ReturnType<typeof setTimeout>[]>([]);
  const videoRef = React.useRef<HTMLIFrameElement>(null);

  // Autoplay handling: browsers block autoplay-with-sound until this page has
  // been interacted with. When YouTube never reports a playing state we show
  // a tap-to-start overlay; one tap unlocks this and all future songs.
  const [needsTap, setNeedsTap] = React.useState(false);
  const playbackConfirmedRef = React.useRef(false);
  const unlockRetryRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against reporting the same video-end more than once (YouTube sends
  // both onStateChange and infoDelivery for the same event).
  const endedHandledRef = React.useRef(false);
  // Whether we've told the server the video is paused on this screen, so we
  // only report transitions (pause → report once, resume → clear once).
  const pausedReportedRef = React.useRef(false);
  // The pause state we most recently drove locally (a host broadcast, or a
  // pause/resume on this screen). Lets applyRoom ignore a lagging poll that
  // still carries the old value before the server write propagates — the same
  // optimism the host uses via pausePolling.
  const localPauseRef = React.useRef<{ paused: boolean; at: number } | null>(null);

  React.useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  React.useEffect(() => {
    if (!joinCode) return;
    return startSessionTracking(joinCode, 'Display', 'display');
  }, [joinCode]);

  // Liveness heartbeat. Ticks from a dedicated Web Worker because browsers
  // throttle window timers in hidden tabs (Chrome: down to once a minute) —
  // a backgrounded display kept playing audio but its starved heartbeat made
  // the server think it died and orphan-heal the song. Worker timers are
  // exempt from that throttling. Also beats immediately when the tab is
  // re-shown, so a returning display never looks stale.
  React.useEffect(() => {
    if (!joinCode || error) return;
    // Fire-and-forget: a dropped beat just means the next one matters more.
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

    // Cross-device backstop: when this tab is torn down, beacon the server so a
    // host on another device can fall back without waiting out the heartbeat
    // TTL. A same-browser host detects the close far faster via the window
    // handle it kept from window.open, so this mainly serves remote displays.
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

  // On the initial load we only seed the seen-set (animate=false) — otherwise
  // a refresh replays the last 30s of cheers all at once.
  function processReactions(reactions: Reaction[] | undefined, animate = true) {
    if (!reactions || reactions.length === 0) return;
    const fresh = reactions.filter((r) => !seenReactionIds.current.has(r.id));
    if (fresh.length === 0) return;
    fresh.forEach((r) => seenReactionIds.current.add(r.id));
    // Cap the seen set to prevent unbounded growth
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
    // Auto-remove after animation
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
    // Trust a just-issued local pause/resume over a lagging poll that predates
    // the server write; after a short window the server is authoritative again.
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

  // Whether this screen is the room's playback surface right now.
  const playsVideoHere = playMode !== 'here';

  React.useEffect(() => {
    if (!joinCode) return;

    let cancelled = false;

    async function init() {
      let room = await getRoom(joinCode!, { display: true });
      if (cancelled) return;
      if (room === "notFound") {
        setError(t('display.errorTitle'));
      } else if (room === "error") {
        // Flaky connection — retryable state; the poll below heals it.
        setLoadError(true);
      } else {
        // For TV rooms this page IS the playback surface, so a display that
        // is just now loading proves any recorded playback no longer exists
        // (stale session, or this page reloading mid-song). Clear it instead
        // of blasting a song the host didn't just start — songs only begin
        // with the host's play button. Here-mode rooms are left alone: their
        // video lives on the host screen and is none of our business.
        // A live heartbeat means ANOTHER display is running the song right
        // now — a second/reopened display must not stop it.
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

  // Instant sync from Host tab via BroadcastChannel
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

  // Instant pause/resume from the host controls (same-browser displays). The
  // poll below is the cross-device fallback; this just skips the poll wait.
  React.useEffect(() => {
    if (!joinCode) return;
    return onDisplayPause(joinCode, (paused) => {
      localPauseRef.current = { paused, at: Date.now() };
      setDisplayPaused(paused);
    });
  }, [joinCode]);

  // Poll as fallback (for cross-device, e.g. Chromecast)
  React.useEffect(() => {
    if (!joinCode || error) return;

    return startVisiblePolling(async () => {
      const room = await getRoom(joinCode, { display: true });
      if (room === "error") return; // transient — try again next tick
      if (room === "notFound") {
        // Only a run of definitive 404s means the room is really gone.
        notFoundPollsRef.current += 1;
        if (notFoundPollsRef.current >= 3) setError(t('display.errorTitle'));
        return;
      }
      notFoundPollsRef.current = 0;
      applyRoom(room);
      // A successful poll also recovers a failed initial load.
      setLoadError(false);
      setLoading(false);
    }, POLL_INTERVAL);
  }, [joinCode, error]);

  const currentSongId = queue[activeIndex]?.id;

  // A new song — or a replay of the same one — needs its end reported again,
  // and starts with a clean pause state.
  React.useEffect(() => {
    endedHandledRef.current = false;
    pausedReportedRef.current = false;
  }, [currentSongId, isPlaying]);

  // Watch YouTube player events while a song should be playing: advance the
  // room when the video ends, and confirm playback actually started (if it
  // never does, the browser blocked autoplay — show the tap-to-start overlay).
  React.useEffect(() => {
    if (!isPlaying || !joinCode || !playsVideoHere) return;
    const roomId = joinCode;
    const endedIndex = activeIndex;

    async function reportVideoEnded() {
      if (endedHandledRef.current) return;
      endedHandledRef.current = true;
      // Advance the room on the server first — that's what reaches hosts on
      // other devices — then refresh this screen right away instead of waiting
      // out the poll, and finally nudge any same-browser host tabs to refetch.
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
          // Playing or buffering — autoplay worked, no tap needed.
          playbackConfirmedRef.current = true;
          setNeedsTap(false);
          if (pausedReportedRef.current) {
            // Resumed after a pause we reported — tell the host controls.
            pausedReportedRef.current = false;
            localPauseRef.current = { paused: false, at: Date.now() };
            reportDisplayPaused(roomId, false);
          }
        } else if (state === 2) {
          // Someone paused the player on this screen. Only report it once
          // per pause and only after playback actually started (scrubbing
          // and pre-start states also pass through 2).
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

  // Autoplay watchdog: if YouTube hasn't reported playing/buffering shortly
  // after the iframe mounts, the browser blocked autoplay on this screen.
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

  // Host-driven pause/resume. In TV mode the host controls flip the room's
  // shared pause flag from a different device; this screen owns the player, so
  // when the polled flag disagrees with what the player is actually doing
  // (tracked by pausedReportedRef), drive the player to match. A pause/resume
  // made on this screen itself already keeps the two in sync, so it no-ops here.
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

  // The tap gives this page sticky user activation — with allow="autoplay" on
  // the iframe, this song and every later one can now play with sound. Also
  // kick the already-mounted player directly, and re-show the overlay if the
  // kick didn't take.
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
  // When the current song is waiting (not playing), include it in the sidebar list
  // so the sidebar doesn't look empty while the center says "UP NEXT"
  const upNext = currentSong && !isPlaying
    ? queue.slice(activeIndex)
    : queue.slice(activeIndex + 1);
  const joinUrl = `${origin || 'https://karaoq.live'}/sing/${joinCode}`;
  // Nothing left in the sidebar to show — reclaim its space for the video.
  const sidebarCollapsed =
    displayConfig.qrSize === 'hidden' && !displayConfig.showUpNext && !displayConfig.welcomeLine;

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

  // Transient failure: the poll keeps running, so this heals by itself the
  // moment the connection comes back.
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

  const themeClass = THEME_CLASS[displayConfig.theme];
  // Only meaningful while the sidebar exists — a collapsed sidebar leaves the
  // default (right-anchored) offsets on the fixed bars.
  const sideClass =
    !sidebarCollapsed && displayConfig.sidebarPosition === 'left' ? styles.sidebarLeft : '';

  return (
    <main
      className={`${styles.main} ${themeClass} ${sideClass}`}
      style={{ '--sb-w': `${displayConfig.sidebarWidth}px` } as React.CSSProperties}
    >
      <header className={`${styles.header} ${sidebarCollapsed ? styles.headerNoSidebar : ''}`}>
        <div className={styles.brand}>KaraoQ</div>
        <FullscreenToggle className={styles.headerFullscreen} />
        <LanguageSwitcher className={styles.headerLang} />
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
            {/* When the host plays the video on their own screen ("here"
                mode), this screen stays a queue board with an on-stage
                banner instead of double-playing the song. */}
            <div className={styles.readyTag}>
              {isPlaying ? t('display.tag.onStage') : t('display.tag.upNext')}
            </div>
            <h1 className={styles.readySinger}>{currentSong.userName}</h1>
            <p className={styles.readySong}>
              {formatSongTitle(currentSong.songTitle)}
            </p>
          </div>
        ) : displayConfig.attractMode ? (
          <AttractPanel
            joinUrl={joinUrl}
            joinCode={joinCode || ''}
            origin={origin}
            welcomeLine={displayConfig.welcomeLine}
            queue={queue}
            activeIndex={activeIndex}
          />
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

        {/* Autoplay blocked: one tap unlocks playback on this screen */}
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

        {reactionsOn && displayConfig.showReactions && visibleReactions.length > 0 && (
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

      {/* Now playing bar (only under the video — the here-mode banner above
          already announces the singer) */}
      {currentSong && isPlaying && playsVideoHere && displayConfig.showNowPlaying && (
        <NowPlayingBar singerName={currentSong.userName} songTitle={currentSong.songTitle} />
      )}

      <div className={styles.footer}>
        <span className={styles.footerLogo}>KaraoQ</span>
        <a href="https://variationsonastring.com" target="_blank" rel="noopener noreferrer" className={styles.footerLink}>
          {renderWithHeart(t('footer.credit'), styles.footerHeart)}
        </a>
      </div>

      {!sidebarCollapsed && (
        <DisplaySidebar
          joinUrl={joinUrl}
          joinCode={joinCode || ''}
          origin={origin}
          upNext={upNext}
          boardsOn={boardsOn}
          singWithMe={singWithMe}
          suggestions={suggestions}
          displayConfig={displayConfig}
        />
      )}
    </main>
  );
};

export default Display;
