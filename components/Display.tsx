import * as React from 'react';
import { useRouter } from 'next/router';
import styles from '../styles/Display.module.css';
import QrJoinCard from './QrJoinCard';
import getRoom from '../app/queue/getRoom';
import postVideoEnded from '../app/queue/postVideoEnded';
import { normalizeRoomId } from '../lib/roomCode';
import { onRoomState, broadcastVideoEnded } from '../app/queue/roomChannel';
import { startSessionTracking } from '../app/queue/trackSession';
import { startVisiblePolling } from '../app/queue/pollWhileVisible';
import { isTextReaction } from '../app/queue/cheerConstants';
import { PlayMode, QueueEntry, Reaction, Room } from '../pages/api/types';

const POLL_INTERVAL = 1500;

function decodeHtml(html: string): string {
  if (typeof document === 'undefined') return html;
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  return txt.value;
}

const Display = (): React.ReactElement => {
  const router = useRouter();
  const joinCode = normalizeRoomId(router.query.joinCode) as string | undefined;

  const [queue, setQueue] = React.useState<QueueEntry[]>([]);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [isPlaying, setIsPlaying] = React.useState(false);
  // In "here" mode the host page is the playback surface — this screen shows
  // the queue and an on-stage banner instead of double-playing the video.
  // Unset playMode (legacy rooms) is treated like "tv" so old setups keep
  // working.
  const [playMode, setPlayMode] = React.useState<PlayMode | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [origin, setOrigin] = React.useState('');
  const [reactionsOn, setReactionsOn] = React.useState(true);
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

  React.useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Session analytics tracking
  React.useEffect(() => {
    if (!joinCode) return;
    return startSessionTracking(joinCode, 'Display', 'display');
  }, [joinCode]);

  // Clean up reaction timers on unmount
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
    setActiveIndex(room.activeVideoIndex);
    setIsPlaying(room.isPlaying ?? false);
    setPlayMode(room.playMode ?? null);
    setReactionsOn(room.reactionsEnabled ?? true);
    processReactions(room.reactions, animateReactions);
  }

  // Whether this screen is the room's playback surface right now.
  const playsVideoHere = playMode !== 'here';

  // Initial room load
  React.useEffect(() => {
    if (!joinCode) return;

    let cancelled = false;

    async function init() {
      const room = await getRoom(joinCode!);
      if (cancelled) return;
      if (room) {
        applyRoom(room, false);
        setLoading(false);
      } else {
        setError('Room not found');
        setLoading(false);
      }
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
      processReactions(state.reactions);
    });
  }, [joinCode]);

  // Poll as fallback (for cross-device, e.g. Chromecast)
  React.useEffect(() => {
    if (!joinCode || error) return;

    return startVisiblePolling(async () => {
      const room = await getRoom(joinCode);
      if (room) applyRoom(room);
    }, POLL_INTERVAL);
  }, [joinCode, error]);

  const currentSongId = queue[activeIndex]?.id;

  // A new song — or a replay of the same one — needs its end reported again.
  React.useEffect(() => {
    endedHandledRef.current = false;
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
      const room = await getRoom(roomId);
      if (room) applyRoom(room);
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

  if (!joinCode) {
    return <div className={styles.loading}><div className={styles.spinner} /></div>;
  }

  if (error) {
    return (
      <main className={styles.main}>
        <div className={styles.errorState}>
          <h2>Room not found</h2>
          <p>Check the room code and try again.</p>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.brand}>KaraoQ</div>
      </header>

      {/* Video area */}
      <div className={styles.videoArea}>
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
              {isPlaying ? 'ON STAGE' : 'UP NEXT'}
            </div>
            <h1 className={styles.readySinger}>{currentSong.userName}</h1>
            <p className={styles.readySong}>
              {decodeHtml(currentSong.songTitle)}
            </p>
          </div>
        ) : (
          <div className={styles.centerState}>
            <div className={styles.waitingIcon}>
              <svg width="80" height="80" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="noteGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#ff2d78" />
                    <stop offset="100%" stopColor="#00f0ff" />
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
            <p className={styles.waitingText}>Scan the QR code or visit <strong>{(origin || 'karaoq.live').replace(/^https?:\/\/(www\.)?/, '')}</strong> and enter code <strong>{joinCode?.toUpperCase()}</strong> to add songs and cheer on the singers!</p>
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
            <span className={styles.tapTitle}>Tap to start playback</span>
            <span className={styles.tapHint}>
              This screen needs one tap before videos can play — after that,
              songs start automatically.
            </span>
          </button>
        )}

        {/* Reaction overlay */}
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

      {/* Now playing bar (only under the video — the here-mode banner above
          already announces the singer) */}
      {currentSong && isPlaying && playsVideoHere && (
        <div className={styles.nowBar}>
          <div className={styles.nowGlow} />
          <div className={styles.nowContent}>
            <div className={styles.nowTop}>
              <span className={styles.nowDot} />
              <span className={styles.nowLabel}>ON STAGE</span>
            </div>
            <div className={styles.nowSinger}>{currentSong.userName}</div>
            <div className={styles.nowSong}>
              {decodeHtml(currentSong.songTitle)}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className={styles.footer}>
        <span className={styles.footerLogo}>KaraoQ</span>
        <a href="https://variationsonastring.com" target="_blank" rel="noopener noreferrer" className={styles.footerLink}>
          made with <span className={styles.footerHeart}>&#9829;</span> by variations on a string
        </a>
      </div>

      {/* Sidebar: Up Next + QR */}
      <div className={styles.sidebar}>
        <QrJoinCard
          joinUrl={joinUrl}
          joinCode={joinCode || ''}
          origin={origin}
        />

        <div className={styles.upNextSection}>
          <h3 className={styles.upNextTitle}>
            Up Next
            {upNext.length > 0 && (
              <span className={styles.upNextCount}>{upNext.length}</span>
            )}
          </h3>
          {upNext.length > 0 ? (
            <div className={styles.upNextList}>
              {upNext.slice(0, 8).map((item, i) => (
                <div key={item.id} className={styles.upNextItem}>
                  <span className={styles.upNextNum}>{i + 1}</span>
                  <div className={styles.upNextInfo}>
                    <span
                      className={styles.upNextItemSinger}
                      title={item.userName}
                    >
                      {item.userName}
                    </span>
                    <span
                      className={styles.upNextItemSong}
                      title={decodeHtml(item.songTitle)}
                    >
                      {decodeHtml(item.songTitle)}
                    </span>
                  </div>
                </div>
              ))}
              {upNext.length > 8 && (
                <div className={styles.moreCount}>
                  +{upNext.length - 8} more
                </div>
              )}
            </div>
          ) : (
            <p className={styles.emptyQueue}>
              No songs queued yet — join to add songs and cheer!
            </p>
          )}
        </div>
      </div>
    </main>
  );
};

export default Display;
