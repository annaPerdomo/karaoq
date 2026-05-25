import * as React from 'react';
import { useRouter } from 'next/router';
import { QRCodeSVG } from 'qrcode.react';

import styles from '../styles/Display.module.css';
import getRoom from '../app/queue/getRoom';
import { onRoomState, broadcastVideoEnded } from '../app/queue/roomChannel';
import { startSessionTracking } from '../app/queue/trackSession';
import { QueueEntry, Reaction } from '../pages/api/types';

const POLL_INTERVAL = 1500;

function isTextReaction(emoji: string): boolean {
  return emoji.length > 2 && /[a-zA-Z]/.test(emoji);
}

function decodeHtml(html: string): string {
  if (typeof document === 'undefined') return html;
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  return txt.value;
}

const Display = (): React.ReactElement => {
  const router = useRouter();
  const joinCode = router.query.joinCode as string | undefined;

  const [queue, setQueue] = React.useState<QueueEntry[]>([]);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [origin, setOrigin] = React.useState('');
  const [reactionsOn, setReactionsOn] = React.useState(true);
  const [visibleReactions, setVisibleReactions] = React.useState<(Reaction & { key: string; left: number })[]>([]);
  const seenReactionIds = React.useRef(new Set<string>());
  const reactionTimers = React.useRef<ReturnType<typeof setTimeout>[]>([]);
  const videoRef = React.useRef<HTMLIFrameElement>(null);

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

  function processReactions(reactions: Reaction[] | undefined) {
    if (!reactions || reactions.length === 0) return;
    const fresh = reactions.filter((r) => !seenReactionIds.current.has(r.id));
    if (fresh.length === 0) return;
    fresh.forEach((r) => seenReactionIds.current.add(r.id));
    // Cap the seen set to prevent unbounded growth
    if (seenReactionIds.current.size > 200) {
      const entries = Array.from(seenReactionIds.current);
      seenReactionIds.current = new Set(entries.slice(-100));
    }
    const withKeys = fresh.map((r) => ({
      ...r,
      key: r.id,
      left: 10 + Math.random() * 25,
    }));
    setVisibleReactions((prev) => [...prev, ...withKeys]);
    // Auto-remove after animation
    const timer = setTimeout(() => {
      const ids = new Set(fresh.map((r) => r.id));
      setVisibleReactions((prev) => prev.filter((r) => !ids.has(r.key)));
    }, 4000);
    reactionTimers.current.push(timer);
  }

  // Initial room load
  React.useEffect(() => {
    if (!joinCode) return;

    let cancelled = false;

    async function init() {
      const room = await getRoom(joinCode!);
      if (cancelled) return;
      if (room) {
        setQueue(room.queue);
        setActiveIndex(room.activeVideoIndex);
        setIsPlaying(room.isPlaying ?? false);
        setReactionsOn(room.reactionsEnabled ?? true);
        processReactions(room.reactions);
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

    const interval = setInterval(async () => {
      const room = await getRoom(joinCode);
      if (room) {
        setQueue(room.queue);
        setActiveIndex(room.activeVideoIndex);
        setIsPlaying(room.isPlaying ?? false);
        setReactionsOn(room.reactionsEnabled ?? true);
        processReactions(room.reactions);
      }
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [joinCode, error]);

  // Notify Host when a YouTube video ends (for TV mode)
  React.useEffect(() => {
    if (!isPlaying || !joinCode) return;
    const roomId = joinCode;

    function onMessage(e: MessageEvent) {
      if (e.origin !== 'https://www.youtube.com') return;
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (
          (data.event === 'onStateChange' && data.info === 0) ||
          (data.event === 'infoDelivery' && data.info?.playerState === 0)
        ) {
          broadcastVideoEnded(roomId);
        }
      } catch {}
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [isPlaying, joinCode]);

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
      {/* Video area */}
      <div className={styles.videoArea}>
        {loading ? (
          <div className={styles.centerState}>
            <div className={styles.spinner} />
          </div>
        ) : currentSong && isPlaying ? (
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
            <div className={styles.readyTag}>UP NEXT</div>
            <h1 className={styles.readySinger}>{currentSong.userName}</h1>
            <p className={styles.readySong}>
              {decodeHtml(currentSong.songTitle)}
            </p>
            <div className={styles.readyPulse} />
          </div>
        ) : (
          <div className={styles.centerState}>
            <div className={styles.waitingIcon}>🎤</div>
            <h1 className={styles.waitingTitle}>KaraoQ</h1>
            <p className={styles.waitingText}>Scan to add songs</p>
          </div>
        )}

        {/* Reaction overlay */}
        {reactionsOn && visibleReactions.length > 0 && (
          <div className={styles.reactionOverlay}>
            {visibleReactions.map((r) => (
              <div
                key={r.key}
                className={styles.reactionBubble}
                style={{ left: `${r.left}%` }}
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

      {/* Now playing bar */}
      {currentSong && isPlaying && (
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

      {/* Sidebar: Up Next + QR */}
      <div className={styles.sidebar}>
        <div className={styles.qrSection}>
          <QRCodeSVG
            value={joinUrl}
            size={120}
            bgColor="transparent"
            fgColor="#ffffff"
            level="M"
          />
          <div className={styles.qrInfo}>
            <span className={styles.qrLabel}>JOIN AT</span>
            <span className={styles.qrUrl}>
              {(origin || 'karaoq.live').replace(/^https?:\/\/(www\.)?/, '')}
            </span>
            <span className={styles.qrLabel}>CODE</span>
            <span className={styles.qrCode}>{joinCode}</span>
          </div>
        </div>

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
                    <span className={styles.upNextItemSinger}>
                      {item.userName}
                    </span>
                    <span className={styles.upNextItemSong}>
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
              No songs queued — scan to add!
            </p>
          )}
        </div>
      </div>
    </main>
  );
};

export default Display;
