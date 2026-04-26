import * as React from 'react';
import { useRouter } from 'next/router';
import { v4 as uuidv4 } from 'uuid';

import styles from '../styles/Sing.module.css';
import getRoom from '../app/queue/getRoom';
import postEntryToQueue from '../app/queue/postEntryToQueue';
import { QueueEntry } from '../pages/api/types';

const POLL_INTERVAL = 3000;

interface YoutubeResult {
  title: string;
  thumbnailUrl: string;
  videoId: string;
}

function decodeHtml(html: string): string {
  if (typeof document === 'undefined') return html;
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  return txt.value;
}

async function searchYoutube(query: string): Promise<YoutubeResult[]> {
  const params = new URLSearchParams({
    part: 'snippet',
    q: query,
    videoEmbeddable: 'true',
    key: process.env.NEXT_PUBLIC_YOUTUBE_API_KEY!,
    type: 'video',
    maxResults: '8',
  });

  const resp = await fetch(
    'https://www.googleapis.com/youtube/v3/search?' + params
  );
  const data = await resp.json();

  return (
    data.items?.map((item: any) => ({
      title: decodeHtml(item.snippet.title),
      thumbnailUrl:
        item.snippet.thumbnails.medium?.url ||
        item.snippet.thumbnails.default?.url,
      videoId: item.id.videoId,
    })) ?? []
  );
}

const Sing = (): React.ReactElement => {
  const router = useRouter();
  const joinCode = router.query.joinCode as string | undefined;

  const [songs, setSongs] = React.useState<YoutubeResult[]>([]);
  const [query, setQuery] = React.useState('');
  const [queue, setQueue] = React.useState<QueueEntry[]>([]);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [username, setUsername] = React.useState('');
  const [showModal, setShowModal] = React.useState(false);
  const [chosenSong, setChosenSong] = React.useState<YoutubeResult | null>(
    null
  );
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [searching, setSearching] = React.useState(false);
  const [justAdded, setJustAdded] = React.useState<string | null>(null);

  // Load saved username
  React.useEffect(() => {
    const saved = localStorage.getItem('karaoq_username');
    if (saved) setUsername(saved);
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
        setLoading(false);
      } else {
        setError('Room not found. Check your code and try again.');
        setLoading(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, [joinCode]);

  // Poll for updates
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

  async function search() {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const results = await searchYoutube(query);
      setSongs(results);
    } catch {
      setSongs([]);
    }
    setSearching(false);
  }

  function openAddModal(song: YoutubeResult) {
    setChosenSong(song);
    setShowModal(true);
  }

  async function addSong() {
    if (!chosenSong || !joinCode || !username.trim()) return;

    localStorage.setItem('karaoq_username', username.trim());

    const entry: QueueEntry = {
      id: uuidv4(),
      userName: username.trim(),
      songTitle: chosenSong.title,
      videoId: chosenSong.videoId,
    };

    await postEntryToQueue(joinCode, entry);
    setQueue([...queue, entry]);
    setShowModal(false);
    setChosenSong(null);
    setSongs([]);
    setQuery('');

    setJustAdded(entry.songTitle);
    setTimeout(() => setJustAdded(null), 3000);
  }

  const upcomingSongs = queue.slice(activeIndex);
  const currentSong = queue[activeIndex];

  if (!joinCode) {
    return <div className={styles.loadingScreen}><div className={styles.spinner} /></div>;
  }

  if (error) {
    return (
      <main className={styles.main}>
        <div className={styles.errorCard}>
          <div className={styles.errorIcon}>😕</div>
          <h2>Room Not Found</h2>
          <p>{error}</p>
          <button className={styles.btnPink} onClick={() => router.push('/')}>
            Go Home
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.brand} onClick={() => router.push('/')}>
          KaraoQ
        </div>
        <div className={styles.roomBadge}>
          Room: <strong>{joinCode}</strong>
        </div>
      </header>

      <div className={styles.body}>
        {/* Name input */}
        <div className={styles.nameSection}>
          <label className={styles.nameLabel}>Your name</label>
          <input
            className={styles.nameInput}
            placeholder="Enter your name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        {/* Search */}
        <div className={styles.searchSection}>
          <div className={styles.searchBar}>
            <input
              className={styles.searchInput}
              type="text"
              placeholder={'Search YouTube (try adding "karaoke")'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
            />
            <button
              className={styles.searchBtn}
              onClick={search}
              disabled={searching || !query.trim()}
            >
              {searching ? '...' : 'Search'}
            </button>
          </div>
        </div>

        {/* Toast notification */}
        {justAdded && (
          <div className={styles.toast}>
            Added &ldquo;{justAdded}&rdquo; to the queue!
          </div>
        )}

        {/* Search results */}
        {songs.length > 0 && (
          <div className={styles.results}>
            {songs.map((song) => (
              <div key={song.videoId} className={styles.resultCard}>
                <img
                  src={song.thumbnailUrl}
                  alt=""
                  className={styles.resultThumb}
                />
                <span className={styles.resultTitle}>{song.title}</span>
                <button
                  className={styles.addBtn}
                  onClick={() => openAddModal(song)}
                  disabled={!username.trim()}
                  title={!username.trim() ? 'Enter your name first' : 'Add to queue'}
                >
                  +
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Now playing */}
        {currentSong && (
          <div className={styles.nowPlaying}>
            <span className={styles.nowDot} />
            <span className={styles.nowLabel}>Now Playing:</span>
            <span className={styles.nowSong}>
              {decodeHtml(currentSong.songTitle)}
            </span>
            <span className={styles.nowSinger}>— {currentSong.userName}</span>
          </div>
        )}

        {/* Queue */}
        <div className={styles.queueSection}>
          <h3 className={styles.queueTitle}>
            Up Next
            {upcomingSongs.length > 1 && (
              <span className={styles.queueCount}>
                {upcomingSongs.length - (currentSong ? 1 : 0)} songs
              </span>
            )}
          </h3>
          {loading ? (
            <div className={styles.loadingQueue}>
              <div className={styles.spinner} />
            </div>
          ) : upcomingSongs.length > 1 ? (
            <div className={styles.queueList}>
              {upcomingSongs.slice(1).map((item, i) => (
                <div key={item.id} className={styles.queueItem}>
                  <span className={styles.queueNum}>{i + 1}</span>
                  <div className={styles.queueInfo}>
                    <span className={styles.queueSong}>
                      {decodeHtml(item.songTitle)}
                    </span>
                    <span className={styles.queueSinger}>
                      {item.userName}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.emptyQueue}>
              No songs queued yet — search and add one!
            </p>
          )}
        </div>
      </div>

      {/* Add modal */}
      {showModal && chosenSong && (
        <div className={styles.overlay} onClick={() => setShowModal(false)}>
          <div
            className={styles.modal}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={styles.modalTitle}>Add to queue?</h3>
            <img
              src={chosenSong.thumbnailUrl}
              alt=""
              className={styles.modalThumb}
            />
            <p className={styles.modalSong}>{chosenSong.title}</p>
            <p className={styles.modalAs}>
              Adding as <strong>{username}</strong>
            </p>
            <div className={styles.modalActions}>
              <button className={styles.btnPink} onClick={addSong}>
                Add Song
              </button>
              <button
                className={styles.btnGhost}
                onClick={() => setShowModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default Sing;
