import * as React from 'react';
import { useRouter } from 'next/router';
import { QRCodeSVG } from 'qrcode.react';

import styles from '../styles/Display.module.css';
import getRoom from '../app/queue/getRoom';
import { onRoomState } from '../app/queue/roomChannel';
import { QueueEntry } from '../pages/api/types';

const POLL_INTERVAL = 1500;

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

  React.useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

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
      }
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [joinCode, error]);

  const currentSong = queue[activeIndex];
  const upNext = queue.slice(activeIndex + 1);
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
            key={currentSong.id}
            className={styles.video}
            src={`https://www.youtube.com/embed/${currentSong.videoId}?autoplay=1&rel=0&modestbranding=1&iv_load_policy=3`}
            allow="autoplay; encrypted-media"
            allowFullScreen
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
              {(origin || 'karaoq.live').replace(/^https?:\/\//, '')}
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
