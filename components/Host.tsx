import * as React from 'react';
import { useRouter } from 'next/router';

import styles from '../styles/Host.module.css';
import getRoom from '../app/queue/getRoom';
import createRoom from '../app/queue/createRoom';
import updatePosition from '../app/queue/updatePosition';
import { QueueEntry } from '../pages/api/types';

const POLL_INTERVAL = 3000;

const Host = (): React.ReactElement => {
  const router = useRouter();
  const joinCode = router.query.joinCode as string | undefined;

  const [queue, setQueue] = React.useState<QueueEntry[]>([]);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [origin, setOrigin] = React.useState('');

  React.useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Initial load + ensure room exists
  React.useEffect(() => {
    if (!joinCode) return;

    let cancelled = false;

    async function init() {
      await createRoom(joinCode!);
      const room = await getRoom(joinCode!);
      if (cancelled) return;
      if (room) {
        setQueue(room.queue);
        setActiveIndex(room.activeVideoIndex);
        setLoading(false);
      } else {
        setError('Room not found');
        setLoading(false);
      }
    }

    init();
    return () => { cancelled = true; };
  }, [joinCode]);

  // Poll for queue updates
  React.useEffect(() => {
    if (!joinCode || error) return;

    const interval = setInterval(async () => {
      const room = await getRoom(joinCode);
      if (room) {
        setQueue(room.queue);
        setActiveIndex(room.activeVideoIndex);
      }
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [joinCode, error]);

  async function playNext() {
    if (!joinCode) return;
    const nextIndex = activeIndex + 1;
    if (nextIndex >= queue.length) return;
    const ok = await updatePosition(joinCode, nextIndex);
    if (ok) setActiveIndex(nextIndex);
  }

  const currentSong = queue[activeIndex];
  const upNext = queue.slice(activeIndex + 1);

  if (!joinCode) return <div className={styles.loading}>Loading...</div>;

  if (error) {
    return (
      <main className={styles.main}>
        <div className={styles.errorCard}>
          <h2>Oops!</h2>
          <p>{error}</p>
          <button className={styles.btn} onClick={() => router.push('/')}>
            Go Home
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      {/* Top bar */}
      <header className={styles.header}>
        <div className={styles.brand} onClick={() => router.push('/')}>
          KaraoQ
        </div>
        <div className={styles.joinInfo}>
          <span className={styles.joinLabel}>JOIN AT</span>
          <span className={styles.joinUrl}>
            {origin || 'karaoq.vercel.app'}
          </span>
          <span className={styles.joinLabel}>CODE</span>
          <span className={styles.joinCode}>{joinCode}</span>
        </div>
        <button
          className={styles.nextBtn}
          onClick={playNext}
          disabled={activeIndex + 1 >= queue.length}
        >
          Next Song →
        </button>
      </header>

      {/* Main content */}
      <div className={styles.content}>
        {/* Video player */}
        <div className={styles.playerArea}>
          {loading ? (
            <div className={styles.emptyState}>
              <div className={styles.spinner} />
              <p>Loading room...</p>
            </div>
          ) : currentSong ? (
            <>
              <iframe
                className={styles.video}
                src={`https://www.youtube.com/embed/${currentSong.videoId}?autoplay=1&rel=0`}
                allow="autoplay; encrypted-media"
                allowFullScreen
              />
              <div className={styles.nowPlaying}>
                <span className={styles.nowPlayingDot} />
                <span className={styles.nowPlayingLabel}>NOW PLAYING</span>
                <span className={styles.nowPlayingSong}>
                  {decodeHtml(currentSong.songTitle)}
                </span>
                <span className={styles.nowPlayingSinger}>
                  {currentSong.userName}
                </span>
              </div>
            </>
          ) : (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>🎤</div>
              <h2>Waiting for songs...</h2>
              <p>
                Share code <strong>{joinCode}</strong> with your friends!
              </p>
            </div>
          )}
        </div>

        {/* Queue sidebar */}
        <div className={styles.sidebar}>
          <h3 className={styles.sidebarTitle}>Up Next</h3>
          {upNext.length > 0 ? (
            <div className={styles.queueList}>
              {upNext.map((item, i) => (
                <div key={item.id} className={styles.queueItem}>
                  <span className={styles.queueNum}>{i + 1}</span>
                  <div className={styles.queueInfo}>
                    <span className={styles.queueSong}>
                      {decodeHtml(item.songTitle)}
                    </span>
                    <span className={styles.queueSinger}>{item.userName}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.emptyQueue}>No songs queued yet</p>
          )}
        </div>
      </div>
    </main>
  );
};

function decodeHtml(html: string): string {
  if (typeof document === 'undefined') return html;
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  return txt.value;
}

export default Host;
