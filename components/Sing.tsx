import * as React from 'react';
import { useRouter } from 'next/router';
import { v4 as uuidv4 } from 'uuid';

import styles from '../styles/Sing.module.css';
import CheerBar from './CheerBar';
import SongSearch from './SongSearch';
import SocialBoards from './SocialBoards';
import getRoom from '../app/queue/getRoom';
import { normalizeRoomId } from '../lib/roomCode';
import postReaction from '../app/queue/postReaction';
import { CHEER_EMOJIS, REACTION_COOLDOWN_MS, isTextReaction } from '../app/queue/cheerConstants';
import { startSessionTracking } from '../app/queue/trackSession';
import { startVisiblePolling } from '../app/queue/pollWhileVisible';
import { QueueEntry, Reaction, SingWithMePost, SuggestedSong } from '../pages/api/types';
import { useT } from '../lib/i18n/I18nProvider';
import { getStoredName, setStoredName } from '../lib/username';
import LanguageSwitcher from './LanguageSwitcher';


const POLL_INTERVAL = 5000;
// Global (not per-room) so a returning singer is remembered across any room.
const NAME_STORAGE_KEY = 'karaoq_username';

function decodeHtml(html: string): string {
  if (typeof document === 'undefined') return html;
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  return txt.value;
}

const Sing = (): React.ReactElement => {
  const router = useRouter();
  const { t } = useT();
  const joinCode = normalizeRoomId(router.query.joinCode) as string | undefined;

  const [queue, setQueue] = React.useState<QueueEntry[]>([]);
  const [singWithMe, setSingWithMe] = React.useState<SingWithMePost[]>([]);
  const [suggestions, setSuggestions] = React.useState<SuggestedSong[]>([]);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [username, setUsername] = React.useState('');
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [reactionsOn, setReactionsOn] = React.useState(true);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reactionCooldown, setReactionCooldown] = React.useState(false);
  const [lastSentEmoji, setLastSentEmoji] = React.useState<string | null>(null);
  const [mobileQueueOpen, setMobileQueueOpen] = React.useState(false);
  // Live height while a finger is dragging the drawer handle; null hands
  // control back to the CSS max-height + transition.
  const [drawerDragHeight, setDrawerDragHeight] = React.useState<number | null>(null);
  const drawerRef = React.useRef<HTMLDivElement>(null);
  const drawerDrag = React.useRef({ startY: 0, startHeight: 0, delta: 0, dragging: false });
  const [boardsOpen, setBoardsOpen] = React.useState(true);
  const [showWelcome, setShowWelcome] = React.useState(true);
  // First-run tips are a non-blocking banner above search (see render) rather
  // than a gate — a new singer can start searching immediately. Returning
  // singers who've already dismissed it never see it again.
  const [showTipsBanner, setShowTipsBanner] = React.useState(false);
  const [welcomeName, setWelcomeName] = React.useState('');
  const [visibleReactions, setVisibleReactions] = React.useState<(Reaction & { key: string; left: number; sway: number })[]>([]);
  const seenReactionIds = React.useRef(new Set<string>());
  const reactionTimers = React.useRef<ReturnType<typeof setTimeout>[]>([]);

  React.useEffect(() => {
    const saved = getStoredName(NAME_STORAGE_KEY);
    if (saved) {
      setUsername(saved);
      setShowWelcome(false);
    }
    try {
      if (!localStorage.getItem('karaoq_seen_tips')) setShowTipsBanner(true);
    } catch {
      /* private mode — show the first-run banner, harmless */
      setShowTipsBanner(true);
    }
  }, []);

  // Persist the name wherever the singer sets it — welcome overlay or the inline
  // search field — so a reload or a return trip skips the prompt. The helper is
  // guarded + cookie-backed for the flaky mobile/in-app storage singers hit.
  React.useEffect(() => {
    setStoredName(NAME_STORAGE_KEY, username);
  }, [username]);

  function handleWelcomeSubmit() {
    const name = welcomeName.trim();
    if (!name) return;
    setUsername(name);
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

  // The "In this room" board starts open (discoverability) but a singer's
  // collapse choice sticks per room, like the host's cheers/QR shelves.
  React.useEffect(() => {
    if (!joinCode) return;
    try {
      setBoardsOpen(localStorage.getItem(`karaoq_boards_hidden_${joinCode}`) !== '1');
    } catch {
      /* private mode — default stays open */
    }
  }, [joinCode]);

  function toggleBoards() {
    const next = !boardsOpen;
    setBoardsOpen(next);
    try {
      localStorage.setItem(`karaoq_boards_hidden_${joinCode}`, next ? '0' : '1');
    } catch {
      /* private mode — just won't be remembered */
    }
  }

  React.useEffect(() => {
    if (!joinCode || !username || showWelcome) return;
    return startSessionTracking(joinCode, username, 'singer');
  }, [joinCode, username, showWelcome]);

  React.useEffect(() => {
    const timers = reactionTimers.current;
    return () => {
      timers.forEach(clearTimeout);
    };
  }, []);

  const spawnReactionPops = React.useCallback((fresh: Reaction[]) => {
    const withKeys = fresh.map((r) => ({
      ...r,
      key: r.id,
      left: 5 + Math.random() * 60,
      sway: Math.random() * 60 - 30,
    }));
    setVisibleReactions((prev) => [...prev, ...withKeys]);
    const timer = setTimeout(() => {
      const ids = new Set(fresh.map((r) => r.id));
      setVisibleReactions((prev) => prev.filter((r) => !ids.has(r.key)));
    }, 4200);
    reactionTimers.current.push(timer);
  }, []);

  // Mark polled reactions as seen; animate the new ones so the whole room
  // sees each cheer, not just the display screen. On the initial load we only
  // seed the seen-set — replaying the last 30s of cheers at once would spam
  // whoever just joined.
  const processReactions = React.useCallback(
    (reactions: Reaction[] | undefined, animate = true) => {
      if (!reactions || reactions.length === 0) return;
      const fresh = reactions.filter((r) => !seenReactionIds.current.has(r.id));
      if (fresh.length === 0) return;
      fresh.forEach((r) => seenReactionIds.current.add(r.id));
      if (seenReactionIds.current.size > 200) {
        const entries = Array.from(seenReactionIds.current);
        seenReactionIds.current = new Set(entries.slice(-100));
      }
      if (animate) spawnReactionPops(fresh);
    },
    [spawnReactionPops]
  );

  React.useEffect(() => {
    if (!joinCode) return;

    let cancelled = false;
    async function init() {
      const room = await getRoom(joinCode!);
      if (cancelled) return;
      if (room) {
        setQueue(room.queue);
        setSingWithMe(room.singWithMe ?? []);
        setSuggestions(room.suggestions ?? []);
        setActiveIndex(room.activeVideoIndex);
        setIsPlaying(room.isPlaying ?? false);
        setReactionsOn(room.reactionsEnabled ?? true);
        processReactions(room.reactions, false);
        setLoading(false);
      } else {
        setError(t('sing.error.notFound'));
        setLoading(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, [joinCode, processReactions]);

  React.useEffect(() => {
    if (!joinCode || error) return;

    return startVisiblePolling(async () => {
      const room = await getRoom(joinCode);
      if (room) {
        setQueue(room.queue);
        setSingWithMe(room.singWithMe ?? []);
        setSuggestions(room.suggestions ?? []);
        setActiveIndex(room.activeVideoIndex);
        setIsPlaying(room.isPlaying ?? false);
        setReactionsOn(room.reactionsEnabled ?? true);
        processReactions(room.reactions);
      }
    }, POLL_INTERVAL);
  }, [joinCode, error, processReactions]);

  // Pull the latest room immediately after a board action so the singer sees
  // their post / join land without waiting for the next poll tick.
  const refreshBoards = React.useCallback(async () => {
    if (!joinCode) return;
    const room = await getRoom(joinCode);
    if (room) {
      setQueue(room.queue);
      setSingWithMe(room.singWithMe ?? []);
      setSuggestions(room.suggestions ?? []);
    }
  }, [joinCode]);

  function handleSongAdded(entry: QueueEntry) {
    setQueue([...queue, entry]);
  }

  async function sendReaction(emoji: string) {
    if (!joinCode || reactionCooldown || !username.trim()) return;
    setReactionCooldown(true);
    setLastSentEmoji(emoji);
    setTimeout(() => setLastSentEmoji(null), 1500);
    setTimeout(() => setReactionCooldown(false), REACTION_COOLDOWN_MS);
    const id = uuidv4();
    // Pop your own cheer locally right away; the seen-set keeps the next poll
    // from replaying it.
    seenReactionIds.current.add(id);
    spawnReactionPops([{ id, emoji, userName: username.trim(), timestamp: Date.now() }]);
    await postReaction(joinCode, id, emoji, username.trim());
  }

  // The grabber invites dragging, so the handle honors it: the drawer follows
  // the finger, then snaps open or closed based on which way it moved. Taps
  // (movement under the start threshold) fall through to the click toggle.
  const DRAG_START_PX = 8;
  const DRAG_COMMIT_PX = 40;
  const DRAWER_COLLAPSED_PX = 52; // matches the 3.25rem collapsed max-height

  function handleDrawerTouchStart(e: React.TouchEvent) {
    drawerDrag.current = {
      startY: e.touches[0].clientY,
      startHeight: drawerRef.current?.getBoundingClientRect().height ?? 0,
      delta: 0,
      dragging: false,
    };
  }

  function handleDrawerTouchMove(e: React.TouchEvent) {
    const drag = drawerDrag.current;
    drag.delta = drag.startY - e.touches[0].clientY;
    if (!drag.dragging && Math.abs(drag.delta) < DRAG_START_PX) return;
    drag.dragging = true;
    const maxHeight = window.innerHeight * 0.75; // matches the 75vh open max-height
    setDrawerDragHeight(
      Math.min(Math.max(drag.startHeight + drag.delta, DRAWER_COLLAPSED_PX), maxHeight)
    );
  }

  function handleDrawerTouchEnd() {
    const drag = drawerDrag.current;
    if (!drag.dragging) return;
    if (drag.delta > DRAG_COMMIT_PX) setMobileQueueOpen(true);
    else if (drag.delta < -DRAG_COMMIT_PX) setMobileQueueOpen(false);
    setDrawerDragHeight(null);
  }

  function handleDrawerHandleClick() {
    // A drag can still synthesize a click on release; only toggle on real taps.
    if (drawerDrag.current.dragging) return;
    setMobileQueueOpen(!mobileQueueOpen);
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
          <h2>{t('sing.error.title')}</h2>
          <p>{error}</p>
          <button className={styles.btnPink} onClick={() => router.push('/')}>
            {t('common.goHome')}
          </button>
        </div>
      </main>
    );
  }

  const showingNowPlaying = !!(currentSong && isPlaying);
  const queueItems = showingNowPlaying ? upcomingSongs.slice(1) : upcomingSongs;
  const queueCount = queueItems.length;
  // One-tap cheer row on the collapsed drawer; the expanded drawer shows the
  // full CheerBar instead, so the row hides while open.
  const quickCheerVisible = showingNowPlaying && reactionsOn && !mobileQueueOpen;

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div className={styles.brand} onClick={() => router.push('/')}>
          KaraoQ
        </div>
        <div className={styles.headerRight}>
          <LanguageSwitcher />
          <div className={styles.roomBadge}>
            {t('common.room')}: <strong>{joinCode?.toUpperCase()}</strong>
          </div>
        </div>
      </header>

      <div className={styles.content}>
        {/* Left panel: search + results */}
        <div
          className={`${styles.searchPanel} ${showingNowPlaying && reactionsOn ? styles.searchPanelCheer : ''}`}
        >
          {!showWelcome && showTipsBanner && (
            <div className={styles.tipsBanner}>
              <div className={styles.tipsBannerBody}>
                <span className={styles.tipsBannerTitle}>
                  {username ? t('sing.tips.welcomeNamed', { name: username }) : t('sing.tips.welcome')}
                </span>
                <span className={styles.tipsBannerText}>
                  {t('sing.tips.body')}
                </span>
              </div>
              <button
                className={styles.tipsBannerClose}
                onClick={dismissTips}
                aria-label={t('sing.tips.dismiss')}
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
              belowSearch={
                <div className={styles.boardsSection}>
                  <button
                    className={styles.boardsToggle}
                    onClick={toggleBoards}
                    aria-expanded={boardsOpen}
                  >
                    <span className={styles.boardsTitle}>
                      <span className={styles.boardsLiveDot} />
                      {t('sing.boards.toggle')}
                      {singWithMe.length + suggestions.length > 0 && (
                        <span className={styles.boardsCountBadge}>
                          {singWithMe.length + suggestions.length}
                        </span>
                      )}
                    </span>
                    <span
                      className={`${styles.boardsCaret} ${boardsOpen ? styles.boardsCaretOpen : ''}`}
                    >
                      &#x25BE;
                    </span>
                  </button>
                  {boardsOpen && (
                    <div className={styles.boardsBody}>
                      <span className={styles.boardsSub}>
                        {t('sing.boards.sub', { code: joinCode?.toUpperCase() ?? '' })}
                      </span>
                      <SocialBoards
                        roomId={joinCode}
                        userName={username}
                        singWithMe={singWithMe}
                        suggestions={suggestions}
                        onChange={refreshBoards}
                      />
                    </div>
                  )}
                </div>
              }
            />
          )}
        </div>

        {/* Right panel: queue sidebar (desktop) */}
        <aside className={styles.sidebar}>
          {currentSong && isPlaying && (
            <div className={styles.nowPlaying}>
              <div className={styles.nowHeader}>
                <span className={styles.nowDot} />
                <span className={styles.nowLabel}>{t('sing.nowPlaying')}</span>
              </div>
              <p className={styles.nowSinger}>{currentSong.userName}</p>
              <p className={styles.nowSong}>
                {decodeHtml(currentSong.songTitle)}
              </p>
            </div>
          )}

          {/* Cheer bar — with Now Playing, above the queue: cheering is the
              primary action while someone's on stage */}
          {currentSong && isPlaying && reactionsOn ? (
            <CheerBar
              onReaction={sendReaction}
              cooldown={reactionCooldown}
              lastSentEmoji={lastSentEmoji}
              disabled={!username.trim()}
            />
          ) : reactionsOn && queueItems.length > 0 && (
            <div className={styles.cheerHint}>
              {t('sing.cheerHint')}
            </div>
          )}

          <div className={styles.queueSection}>
            <div className={styles.queueHeader}>
              <h3 className={styles.queueTitle}>{t('sing.upNext')}</h3>
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
                <p>{t('sing.queue.emptyTitle')}</p>
                <span>{t('sing.queue.emptyBody')}</span>
              </div>
            )}
          </div>
        </aside>

        {/* Mobile bottom drawer */}
        <div
          ref={drawerRef}
          className={`${styles.mobileDrawer} ${quickCheerVisible ? styles.mobileDrawerCheer : ''} ${mobileQueueOpen ? styles.mobileDrawerOpen : ''} ${drawerDragHeight !== null ? styles.mobileDrawerDragging : ''}`}
          style={
            drawerDragHeight !== null
              ? { maxHeight: drawerDragHeight, transition: 'none' }
              : undefined
          }
        >
          <button
            className={styles.drawerHandle}
            onClick={handleDrawerHandleClick}
            onTouchStart={handleDrawerTouchStart}
            onTouchMove={handleDrawerTouchMove}
            onTouchEnd={handleDrawerTouchEnd}
            onTouchCancel={() => setDrawerDragHeight(null)}
            aria-expanded={mobileQueueOpen}
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
              <span className={styles.drawerLabel}>{t('sing.drawer.queue')}</span>
            )}
            {queueCount > 0 && (
              <span className={styles.drawerBadge}>{t('sing.drawer.upNext', { count: queueCount })}</span>
            )}
            <span className={`${styles.drawerChevron} ${mobileQueueOpen ? styles.drawerChevronOpen : ''}`}>
              &#x25B2;
            </span>
          </button>

          {/* One-tap cheers without opening the drawer */}
          {quickCheerVisible && (
            <div className={styles.quickCheerRow}>
              {CHEER_EMOJIS.slice(0, 5).map((emoji) => (
                <button
                  key={emoji}
                  className={`${styles.quickCheerBtn} ${reactionCooldown ? styles.quickCheerBtnCooldown : ''}`}
                  onClick={() => sendReaction(emoji)}
                  disabled={reactionCooldown || !username.trim()}
                  aria-label={t('sing.cheer.sendAria', { emoji })}
                >
                  {emoji}
                </button>
              ))}
              {lastSentEmoji ? (
                <span className={styles.quickCheerSent}>{t('sing.quickCheer.sent', { emoji: lastSentEmoji })}</span>
              ) : (
                <button
                  className={styles.quickCheerMore}
                  onClick={() => setMobileQueueOpen(true)}
                >
                  {t('sing.quickCheer.more')}
                </button>
              )}
            </div>
          )}

          <div className={styles.drawerBody}>
            {/* Cheer bar — first thing you see when the drawer opens */}
            {currentSong && isPlaying && reactionsOn ? (
              <CheerBar
                onReaction={sendReaction}
                cooldown={reactionCooldown}
                lastSentEmoji={lastSentEmoji}
                disabled={!username.trim()}
                compact
              />
            ) : reactionsOn && queueItems.length > 0 && (
              <div className={styles.cheerHint}>
                Send reactions like 🔥👏❤️ and words of encouragement to cheer on the performer!
              </div>
            )}

            <div className={styles.drawerQueueHeader}>
              <h3 className={styles.queueTitle}>{t('sing.upNext')}</h3>
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
                <p>{t('sing.queue.emptyTitle')}</p>
                <span>{t('sing.queue.emptyBody')}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cheers from everyone in the room float up from the drawer */}
      {reactionsOn && visibleReactions.length > 0 && (
        <div className={styles.reactionOverlay} aria-hidden="true">
          {visibleReactions.map((r) => (
            <div
              key={r.key}
              className={styles.reactionBubble}
              style={{ left: `${r.left}%`, '--sway': `${r.sway}px` } as React.CSSProperties}
            >
              {isTextReaction(r.emoji) ? (
                <span className={styles.reactionTextPop}>{r.emoji}</span>
              ) : (
                <span className={styles.reactionEmojiPop}>{r.emoji}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {showWelcome && !loading && !error && (
        <div className={styles.welcomeOverlay}>
          <div className={styles.welcomeCard}>
            <div className={styles.welcomeLogo}>KaraoQ</div>
            <p className={styles.welcomeRoom}>
              {t('sing.welcome.room').split(/(\{code\})/).map((part, i) =>
                part === '{code}'
                  ? <strong key={i}>{joinCode?.toUpperCase()}</strong>
                  : <React.Fragment key={i}>{part}</React.Fragment>
              )}
            </p>
            <h2 className={styles.welcomePrompt}>{t('sing.welcome.prompt')}</h2>
            <input
              className={styles.welcomeInput}
              placeholder={t('common.enterYourName')}
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
              {t('sing.welcome.go')}
            </button>
          </div>
        </div>
      )}

    </main>
  );
};

export default Sing;
