import * as React from 'react';
import { useRouter } from 'next/router';
import { v4 as uuidv4 } from 'uuid';

import styles from '../styles/Sing.module.css';
import CheerBar from './CheerBar';
import SongSearch from './SongSearch';
import getRoom from '../app/queue/getRoom';
import { normalizeRoomId } from '../lib/roomCode';
import postReaction from '../app/queue/postReaction';
import { REACTION_COOLDOWN_MS } from '../app/queue/cheerConstants';
import { startSessionTracking } from '../app/queue/trackSession';
import { QueueEntry } from '../pages/api/types';


const POLL_INTERVAL = 3000;

function decodeHtml(html: string): string {
  if (typeof document === 'undefined') return html;
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  return txt.value;
}

const Sing = (): React.ReactElement => {
  const router = useRouter();
  const joinCode = normalizeRoomId(router.query.joinCode) as string | undefined;

  const [queue, setQueue] = React.useState<QueueEntry[]>([]);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [username, setUsername] = React.useState('');
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [reactionsOn, setReactionsOn] = React.useState(true);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reactionCooldown, setReactionCooldown] = React.useState(false);
  const [lastSentEmoji, setLastSentEmoji] = React.useState<string | null>(null);
  const [mobileQueueOpen, setMobileQueueOpen] = React.useState(false);
  const [showWelcome, setShowWelcome] = React.useState(true);
  // First-run tips are a non-blocking banner above search (see render) rather
  // than a gate — a new singer can start searching immediately. Returning
  // singers who've already dismissed it never see it again.
  const [showTipsBanner, setShowTipsBanner] = React.useState(false);
  const [welcomeName, setWelcomeName] = React.useState('');

  // Load saved username
  React.useEffect(() => {
    const saved = localStorage.getItem('karaoq_username');
    if (saved) {
      setUsername(saved);
      setShowWelcome(false);
    }
    if (!localStorage.getItem('karaoq_seen_tips')) setShowTipsBanner(true);
  }, []);

  function handleWelcomeSubmit() {
    const name = welcomeName.trim();
    if (!name) return;
    setUsername(name);
    localStorage.setItem('karaoq_username', name);
    setShowWelcome(false);
  }

  function dismissTips() {
    setShowTipsBanner(false);
    try {
      localStorage.setItem('karaoq_seen_tips', '1');
    } catch {
      /* private mode — fine, banner just shows again next visit */
    }
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

  function handleSongAdded(entry: QueueEntry) {
    setQueue([...queue, entry]);
    localStorage.setItem('karaoq_username', username.trim());
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
            Room: <strong>{joinCode?.toUpperCase()}</strong>
          </div>
        </div>
      </header>

      <div className={styles.content}>
        {/* ─── Left panel: search + results ─── */}
        <div className={styles.searchPanel}>
          {!showWelcome && showTipsBanner && (
            <div className={styles.tipsBanner}>
              <div className={styles.tipsBannerBody}>
                <span className={styles.tipsBannerTitle}>
                  Welcome{username ? `, ${username}` : ''}! 🎤
                </span>
                <span className={styles.tipsBannerText}>
                  Search any song to add it to the queue, follow along in Up
                  Next, and cheer on whoever&apos;s on stage.
                </span>
              </div>
              <button
                className={styles.tipsBannerClose}
                onClick={dismissTips}
                aria-label="Dismiss tips"
              >
                ×
              </button>
            </div>
          )}
          {joinCode && (
            <SongSearch
              roomId={joinCode}
              userName={username}
              onSongAdded={handleSongAdded}
              showFilters={false}
              showNameInput={true}
              onNameChange={setUsername}
              requireName={true}
              role="singer"
            />
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
              <p className={styles.nowSinger}>{currentSong.userName}</p>
              <p className={styles.nowSong}>
                {decodeHtml(currentSong.songTitle)}
              </p>
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
                      <span className={styles.queueSinger}>
                        {item.userName}
                      </span>
                      <span className={styles.queueSong}>
                        {decodeHtml(item.songTitle)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptyQueue}>
                <p>No songs queued yet</p>
                <span>Search to add songs, or cheer when someone&apos;s on stage!</span>
              </div>
            )}
          </div>

          {/* Cheer bar — below the queue */}
          {currentSong && isPlaying && reactionsOn ? (
            <CheerBar
              onReaction={sendReaction}
              cooldown={reactionCooldown}
              lastSentEmoji={lastSentEmoji}
              disabled={!username.trim()}
            />
          ) : reactionsOn && queueItems.length > 0 && (
            <div className={styles.cheerHint}>
              Send reactions like 🔥👏❤️ and words of encouragement to cheer on the performer!
            </div>
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
              <>
                <span className={styles.nowDot} />
                <div className={styles.drawerNowPlaying}>
                  <span className={styles.drawerSinger}>{currentSong.userName}</span>
                  <span className={styles.drawerSongTitle}>
                    {decodeHtml(currentSong.songTitle)}
                  </span>
                </div>
              </>
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
                      <span className={styles.queueSinger}>
                        {item.userName}
                      </span>
                      <span className={styles.queueSong}>
                        {decodeHtml(item.songTitle)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptyQueue}>
                <p>No songs queued yet</p>
                <span>Search to add songs, or cheer when someone&apos;s on stage!</span>
              </div>
            )}

            {/* Cheer bar — below the queue (mobile) */}
            {currentSong && isPlaying && reactionsOn ? (
              <CheerBar
                onReaction={sendReaction}
                cooldown={reactionCooldown}
                lastSentEmoji={lastSentEmoji}
                disabled={!username.trim()}
              />
            ) : reactionsOn && queueItems.length > 0 && (
              <div className={styles.cheerHint}>
                Send reactions like 🔥👏❤️ and words of encouragement to cheer on the performer!
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Welcome name gate */}
      {showWelcome && !loading && !error && (
        <div className={styles.welcomeOverlay}>
          <div className={styles.welcomeCard}>
            <div className={styles.welcomeLogo}>KaraoQ</div>
            <p className={styles.welcomeRoom}>
              Room <strong>{joinCode?.toUpperCase()}</strong>
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

    </main>
  );
};

export default Sing;
