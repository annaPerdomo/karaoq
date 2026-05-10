import * as React from 'react';
import { useRouter } from 'next/router';
import { v4 as uuidv4 } from 'uuid';

import styles from '../styles/Sing.module.css';
import CheerBar from './CheerBar';
import getRoom from '../app/queue/getRoom';
import postEntryToQueue from '../app/queue/postEntryToQueue';
import postReaction from '../app/queue/postReaction';
import { REACTION_COOLDOWN_MS } from '../app/queue/cheerConstants';
import { startSessionTracking } from '../app/queue/trackSession';
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
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [reactionsOn, setReactionsOn] = React.useState(true);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [searching, setSearching] = React.useState(false);
  const [justAdded, setJustAdded] = React.useState<string | null>(null);
  const [karaokeMode, setKaraokeMode] = React.useState(true);
  const [reactionCooldown, setReactionCooldown] = React.useState(false);
  const [lastSentEmoji, setLastSentEmoji] = React.useState<string | null>(null);
  const [filters, setFilters] = React.useState<SearchFilters>({
    duration: 'any',
    sortBy: 'relevance',
  });
  const [hasSearched, setHasSearched] = React.useState(false);
  const [mobileQueueOpen, setMobileQueueOpen] = React.useState(false);
  const [showWelcome, setShowWelcome] = React.useState(true);
  const [showTips, setShowTips] = React.useState(false);
  const [welcomeName, setWelcomeName] = React.useState('');

  // Load saved username and karaoke mode preference
  React.useEffect(() => {
    const saved = localStorage.getItem('karaoq_username');
    if (saved) {
      setUsername(saved);
      setShowWelcome(false);
    }
    const savedMode = localStorage.getItem('karaoq_karaoke_mode');
    if (savedMode !== null) setKaraokeMode(savedMode === 'true');
  }, []);

  function handleWelcomeSubmit() {
    const name = welcomeName.trim();
    if (!name) return;
    setUsername(name);
    localStorage.setItem('karaoq_username', name);
    setShowWelcome(false);
    setShowTips(true);
  }

  // Session analytics tracking
  React.useEffect(() => {
    if (!joinCode || !username || showWelcome) return;
    return startSessionTracking(joinCode, username, 'singer');
  }, [joinCode, username, showWelcome]);

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
        setIsPlaying(room.isPlaying ?? false);
        setReactionsOn(room.reactionsEnabled ?? true);
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

    const ok = await postEntryToQueue(joinCode, entry);
    if (!ok) {
      setShowModal(false);
      setChosenSong(null);
      return;
    }
    setQueue([...queue, entry]);
    setShowModal(false);
    setChosenSong(null);
    setSongs([]);
    setQuery('');
    setHasSearched(false);

    setJustAdded(entry.songTitle);
    setTimeout(() => setJustAdded(null), 3000);
  }

  async function sendReaction(emoji: string) {
    if (!joinCode || reactionCooldown || !username.trim()) return;
    setReactionCooldown(true);
    setLastSentEmoji(emoji);
    setTimeout(() => setLastSentEmoji(null), 1500);
    setTimeout(() => setReactionCooldown(false), REACTION_COOLDOWN_MS);
    const id = uuidv4();
    await postReaction(joinCode, id, emoji, username.trim());
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

  const showingNowPlaying = !!(currentSong && isPlaying);
  const queueItems = showingNowPlaying ? upcomingSongs.slice(1) : upcomingSongs;
  const queueCount = queueItems.length;

  return (
    <main className={styles.main}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.brand} onClick={() => router.push('/')}>
          KaraoQ
        </div>
        <div className={styles.headerRight}>
          <div className={styles.roomBadge}>
            Room: <strong>{joinCode}</strong>
          </div>
        </div>
      </header>

      <div className={styles.content}>
        {/* ─── Left panel: search + results ─── */}
        <div className={styles.searchPanel}>
          {/* Name + search bar row */}
          <div className={styles.searchHeader}>
            <div className={styles.nameSection}>
              <label className={styles.nameLabel}>Your name</label>
              <input
                className={styles.nameInput}
                placeholder="Enter your name"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

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

            <div className={styles.searchOptions}>
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
                  <div className={styles.resultInfo}>
                    <span className={styles.resultTitle}>{song.title}</span>
                  </div>
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

          {/* Empty state when no search yet */}
          {!hasSearched && songs.length === 0 && (
            <div className={styles.searchEmpty}>
              <div className={styles.searchEmptyIcon}>&#127908;</div>
              <p>Search for a song to get started</p>
            </div>
          )}
        </div>

        {/* ─── Right panel: queue sidebar (desktop) ─── */}
        <aside className={styles.sidebar}>
          {currentSong && isPlaying && (
            <div className={styles.nowPlaying}>
              <div className={styles.nowHeader}>
                <span className={styles.nowDot} />
                <span className={styles.nowLabel}>Now Playing</span>
              </div>
              <p className={styles.nowSong}>
                {decodeHtml(currentSong.songTitle)}
              </p>
              <p className={styles.nowSinger}>{currentSong.userName}</p>
            </div>
          )}

          <div className={styles.queueSection}>
            <div className={styles.queueHeader}>
              <h3 className={styles.queueTitle}>Up Next</h3>
              {queueCount > 0 && (
                <span className={styles.queueBadge}>{queueCount}</span>
              )}
            </div>
            {loading ? (
              <div className={styles.loadingQueue}>
                <div className={styles.spinner} />
              </div>
            ) : queueItems.length > 0 ? (
              <div className={styles.queueList}>
                {queueItems.map((item, i) => (
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
              <div className={styles.emptyQueue}>
                <p>No songs queued yet</p>
                <span>Search and add one!</span>
              </div>
            )}
          </div>

          {/* Cheer bar — below the queue */}
          {currentSong && isPlaying && reactionsOn && (
            <CheerBar
              onReaction={sendReaction}
              cooldown={reactionCooldown}
              lastSentEmoji={lastSentEmoji}
              disabled={!username.trim()}
            />
          )}
        </aside>

        {/* ─── Mobile bottom drawer ─── */}
        <div
          className={`${styles.mobileDrawer} ${mobileQueueOpen ? styles.mobileDrawerOpen : ''}`}
        >
          <button
            className={styles.drawerHandle}
            onClick={() => setMobileQueueOpen(!mobileQueueOpen)}
          >
            <span className={styles.drawerGrabber} />
            {currentSong && isPlaying ? (
              <div className={styles.drawerNowPlaying}>
                <span className={styles.nowDot} />
                <span className={styles.drawerSongTitle}>
                  {decodeHtml(currentSong.songTitle)}
                </span>
                <span className={styles.drawerSinger}>{currentSong.userName}</span>
              </div>
            ) : (
              <span className={styles.drawerLabel}>Queue</span>
            )}
            {queueCount > 0 && (
              <span className={styles.drawerBadge}>{queueCount} up next</span>
            )}
            <span className={`${styles.drawerChevron} ${mobileQueueOpen ? styles.drawerChevronOpen : ''}`}>
              &#x25B2;
            </span>
          </button>

          <div className={styles.drawerBody}>
            {currentSong && isPlaying && (
              <div className={styles.drawerNowSection}>
                <div className={styles.nowHeader}>
                  <span className={styles.nowDot} />
                  <span className={styles.nowLabel}>Now Playing</span>
                </div>
                <p className={styles.nowSong}>
                  {decodeHtml(currentSong.songTitle)}
                </p>
                <p className={styles.nowSinger}>{currentSong.userName}</p>
              </div>
            )}

            <div className={styles.drawerQueueHeader}>
              <h3 className={styles.queueTitle}>Up Next</h3>
              {queueCount > 0 && (
                <span className={styles.queueBadge}>{queueCount}</span>
              )}
            </div>

            {loading ? (
              <div className={styles.loadingQueue}>
                <div className={styles.spinner} />
              </div>
            ) : queueItems.length > 0 ? (
              <div className={styles.drawerQueueList}>
                {queueItems.map((item, i) => (
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
              <div className={styles.emptyQueue}>
                <p>No songs queued yet</p>
                <span>Search and add one!</span>
              </div>
            )}

            {/* Cheer bar — below the queue (mobile) */}
            {currentSong && isPlaying && reactionsOn && (
              <CheerBar
                onReaction={sendReaction}
                cooldown={reactionCooldown}
                lastSentEmoji={lastSentEmoji}
                disabled={!username.trim()}
              />
            )}
          </div>
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

      {/* Welcome name gate */}
      {showWelcome && !loading && !error && (
        <div className={styles.welcomeOverlay}>
          <div className={styles.welcomeCard}>
            <div className={styles.welcomeLogo}>KaraoQ</div>
            <p className={styles.welcomeRoom}>
              Room <strong>{joinCode}</strong>
            </p>
            <h2 className={styles.welcomePrompt}>What&apos;s your name?</h2>
            <input
              className={styles.welcomeInput}
              placeholder="Enter your name"
              value={welcomeName}
              onChange={(e) => setWelcomeName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleWelcomeSubmit()}
              autoFocus
              maxLength={30}
            />
            <button
              className={styles.welcomeBtn}
              onClick={handleWelcomeSubmit}
              disabled={!welcomeName.trim()}
            >
              Let&apos;s go
            </button>
          </div>
        </div>
      )}

      {/* Tips modal */}
      {showTips && (
        <div className={styles.overlay} onClick={() => setShowTips(false)}>
          <div
            className={styles.tipsModal}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className={styles.tipsGreeting}>
              Welcome, {username}!
            </h2>
            <p className={styles.tipsSubtext}>Here&apos;s how it works</p>

            <div className={styles.tipsList}>
              <div className={styles.tipItem}>
                <div className={styles.tipIcon} style={{ background: 'rgba(255, 45, 120, 0.12)', color: '#ff2d78' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </div>
                <div className={styles.tipText}>
                  <span className={styles.tipTitle}>Search &amp; add songs</span>
                  <span className={styles.tipDesc}>
                    Find karaoke tracks on YouTube and add them to the shared queue
                  </span>
                </div>
              </div>

              <div className={styles.tipItem}>
                <div className={styles.tipIcon} style={{ background: 'rgba(0, 240, 255, 0.12)', color: '#00f0ff' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="8" y1="6" x2="21" y2="6" />
                    <line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" />
                    <line x1="3" y1="12" x2="3.01" y2="12" />
                    <line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                </div>
                <div className={styles.tipText}>
                  <span className={styles.tipTitle}>Watch the queue</span>
                  <span className={styles.tipDesc}>
                    See what&apos;s playing now and what&apos;s coming up next
                  </span>
                </div>
              </div>

              <div className={styles.tipItem}>
                <div className={styles.tipIcon} style={{ background: 'rgba(249, 115, 22, 0.12)', color: '#f97316' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                </div>
                <div className={styles.tipText}>
                  <span className={styles.tipTitle}>Cheer them on</span>
                  <span className={styles.tipDesc}>
                    Send reactions to hype up the current singer
                  </span>
                </div>
              </div>
            </div>

            <button
              className={styles.btnPink}
              onClick={() => setShowTips(false)}
            >
              Got it!
            </button>
          </div>
        </div>
      )}
    </main>
  );
};

export default Sing;
