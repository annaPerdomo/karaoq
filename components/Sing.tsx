import * as React from 'react';
import { useRouter } from 'next/router';
import { v4 as uuidv4 } from 'uuid';

import styles from '../styles/Sing.module.css';
import CheerBar from './CheerBar';
import SongSearch from './SongSearch';
import getRoom from '../app/queue/getRoom';
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
  const joinCode = router.query.joinCode as string | undefined;

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
  const [showTips, setShowTips] = React.useState(false);
  const [welcomeName, setWelcomeName] = React.useState('');

  // Load saved username
  React.useEffect(() => {
    const saved = localStorage.getItem('karaoq_username');
    if (saved) {
      setUsername(saved);
      setShowWelcome(false);
    }
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
          {joinCode && (
            <SongSearch
              roomId={joinCode}
              userName={username}
              onSongAdded={handleSongAdded}
              showFilters={false}
              showNameInput={true}
              onNameChange={setUsername}
              requireName={true}
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
