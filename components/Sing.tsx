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

type VideoDuration = 'any' | 'short' | 'medium' | 'long';
type SortOrder = 'relevance' | 'viewCount' | 'date' | 'rating';

interface SearchFilters {
  duration: VideoDuration;
  sortBy: SortOrder;
}

const DURATION_OPTIONS: { value: VideoDuration; label: string }[] = [
  { value: 'any', label: 'Any length' },
  { value: 'short', label: 'Short (< 4 min)' },
  { value: 'medium', label: 'Medium (4–20 min)' },
  { value: 'long', label: 'Long (> 20 min)' },
];

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'viewCount', label: 'View count' },
  { value: 'date', label: 'Upload date' },
  { value: 'rating', label: 'Rating' },
];

function decodeHtml(html: string): string {
  if (typeof document === 'undefined') return html;
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  return txt.value;
}

async function searchYoutube(
  query: string,
  filters: SearchFilters
): Promise<YoutubeResult[]> {
  const params = new URLSearchParams({
    part: 'snippet',
    q: query,
    videoEmbeddable: 'true',
    key: process.env.NEXT_PUBLIC_YOUTUBE_API_KEY!,
    type: 'video',
    maxResults: '8',
    order: filters.sortBy,
  });

  if (filters.duration !== 'any') {
    params.set('videoDuration', filters.duration);
  }

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
  const [karaokeMode, setKaraokeMode] = React.useState(true);
  const [filters, setFilters] = React.useState<SearchFilters>({
    duration: 'any',
    sortBy: 'relevance',
  });
  const [hasSearched, setHasSearched] = React.useState(false);

  // Load saved username and karaoke mode preference
  React.useEffect(() => {
    const saved = localStorage.getItem('karaoq_username');
    if (saved) setUsername(saved);
    const savedMode = localStorage.getItem('karaoq_karaoke_mode');
    if (savedMode !== null) setKaraokeMode(savedMode === 'true');
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

  function toggleKaraokeMode() {
    const next = !karaokeMode;
    setKaraokeMode(next);
    localStorage.setItem('karaoq_karaoke_mode', String(next));
  }

  async function search(overrideFilters?: SearchFilters) {
    if (!query.trim()) return;
    setSearching(true);
    setHasSearched(true);
    const searchQuery = karaokeMode ? `${query.trim()} karaoke` : query;
    try {
      const results = await searchYoutube(searchQuery, overrideFilters ?? filters);
      setSongs(results);
    } catch {
      setSongs([]);
    }
    setSearching(false);
  }

  function updateFilter<K extends keyof SearchFilters>(
    key: K,
    value: SearchFilters[K]
  ) {
    const next = { ...filters, [key]: value };
    setFilters(next);
    if (hasSearched && query.trim()) {
      // Re-search with updated filters
      setSearching(true);
      const searchQuery = karaokeMode ? `${query.trim()} karaoke` : query;
      searchYoutube(searchQuery, next)
        .then(setSongs)
        .catch(() => setSongs([]))
        .finally(() => setSearching(false));
    }
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
    setHasSearched(false);

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
              placeholder={karaokeMode ? 'Search for a song...' : 'Search YouTube...'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
            />
            <button
              className={styles.searchBtn}
              onClick={() => search()}
              disabled={searching || !query.trim()}
            >
              {searching ? '...' : 'Search'}
            </button>
          </div>
          <label className={styles.toggleRow}>
            <span className={styles.toggleLabel}>Auto-add &ldquo;karaoke&rdquo;</span>
            <button
              type="button"
              role="switch"
              aria-checked={karaokeMode}
              className={`${styles.toggle} ${karaokeMode ? styles.toggleOn : ''}`}
              onClick={toggleKaraokeMode}
            >
              <span className={styles.toggleKnob} />
            </button>
          </label>
          <div className={styles.filterSection}>
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>Duration</span>
              <div className={styles.filterChips}>
                {DURATION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className={`${styles.filterChip} ${
                      filters.duration === opt.value ? styles.filterChipActive : ''
                    }`}
                    onClick={() => updateFilter('duration', opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>Sort by</span>
              <div className={styles.filterChips}>
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className={`${styles.filterChip} ${
                      filters.sortBy === opt.value ? styles.filterChipActive : ''
                    }`}
                    onClick={() => updateFilter('sortBy', opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
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
