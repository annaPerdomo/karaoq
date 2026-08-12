import * as React from 'react';
import { useRouter } from 'next/router';
import { v4 as uuidv4 } from 'uuid';

import styles from '../styles/Sing.module.css';
import SongSearch from './SongSearch';
import BoardsPanel from './BoardsPanel';
import getRoom from '../app/queue/getRoom';
import useBoards from '../app/queue/useBoards';
import { normalizeRoomId } from '../lib/roomCode';
import postReaction from '../app/queue/postReaction';
import { REACTION_COOLDOWN_MS, isTextReaction } from '../app/queue/cheerConstants';
import { startSessionTracking } from '../app/queue/trackSession';
import { startVisiblePolling } from '../app/queue/pollWhileVisible';
import { DisplayTheme, QueueEntry, Reaction, normalizeDisplayConfig } from '../pages/api/types';
import { useT } from '../lib/i18n/I18nProvider';
import { getStoredName, setStoredName } from '../lib/username';
import LanguageSwitcher from './LanguageSwitcher';
import SingSidebar from './sing/SingSidebar';
import MobileQueueDrawer from './sing/MobileQueueDrawer';
import { myTurnState } from './sing/YourTurnCard';
import { useRoomTiming } from './hooks/useRoomTiming';


const POLL_INTERVAL = 5000;
const NAME_STORAGE_KEY = 'karaoq_username';

const THEME_CLASS: Record<DisplayTheme, string> = {
  classic: '',
  minimal: styles.themeMinimal,
  neon: styles.themeNeon,
};

const Sing = (): React.ReactElement => {
  const router = useRouter();
  const { t } = useT();
  const joinCode = normalizeRoomId(router.query.joinCode) as string | undefined;

  const [queue, setQueue] = React.useState<QueueEntry[]>([]);
  // A "sing with me" join can auto-add the song, so re-sync the queue too.
  const boards = useBoards(joinCode, (room) => setQueue(room.queue));
  const applyBoards = boards.applyRoom;
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [username, setUsername] = React.useState('');
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [reactionsOn, setReactionsOn] = React.useState(true);
  const [theme, setTheme] = React.useState<DisplayTheme>('classic');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [loadError, setLoadError] = React.useState(false);
  const [initNonce, setInitNonce] = React.useState(0);
  const notFoundPollsRef = React.useRef(0);
  const [reactionCooldown, setReactionCooldown] = React.useState(false);
  const [lastSentEmoji, setLastSentEmoji] = React.useState<string | null>(null);
  const [mobileQueueOpen, setMobileQueueOpen] = React.useState(false);
  const [showWelcome, setShowWelcome] = React.useState(true);
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
      setShowTipsBanner(true);
    }
  }, []);

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
      /* private mode */
    }
  }

  // Debounced: username updates per keystroke, and restarting the tracker on
  // each one would POST every partial name.
  const [trackedName, setTrackedName] = React.useState('');
  React.useEffect(() => {
    const timer = setTimeout(() => setTrackedName(username), 1500);
    return () => clearTimeout(timer);
  }, [username]);

  // Same contract as Host's adminPeek: /sing/CODE?admin=1 is Anna checking on
  // a room from /admin, so she must not register as a participant or mark the
  // room live.
  const adminPeek = router.query.admin === '1';
  React.useEffect(() => {
    if (!joinCode || !trackedName || showWelcome || adminPeek) return;
    return startSessionTracking(joinCode, trackedName, 'singer');
  }, [joinCode, trackedName, showWelcome, adminPeek]);

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

  // animate=false on initial load only seeds the seen-set — otherwise a join
  // replays the last 30s of cheers at once.
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

  const timing = useRoomTiming({
    queue,
    activeVideoIndex: activeIndex,
    isPlaying,
  });
  const { estimate, sessionEndsAt } = timing;
  const applyTiming = timing.adoptRoom;

  React.useEffect(() => {
    if (!joinCode) return;

    let cancelled = false;
    async function init() {
      const room = await getRoom(joinCode!);
      if (cancelled) return;
      if (room === "notFound") {
        setError(t('sing.error.notFound'));
      } else if (room === "error") {
        setLoadError(true);
      } else {
        setQueue(room.queue);
        applyBoards(room);
        setActiveIndex(room.activeVideoIndex);
        setIsPlaying(room.isPlaying ?? false);
        applyTiming(room);
        setReactionsOn(room.reactionsEnabled ?? true);
        setTheme(normalizeDisplayConfig(room.displayConfig).theme);
        processReactions(room.reactions, false);
        setLoadError(false);
      }
      setLoading(false);
    }
    init();
    return () => { cancelled = true; };
  }, [joinCode, processReactions, initNonce, applyBoards, applyTiming]);

  React.useEffect(() => {
    if (!joinCode || error) return;

    return startVisiblePolling(async () => {
      const room = await getRoom(joinCode);
      if (room === "error") return;
      if (room === "notFound") {
        notFoundPollsRef.current += 1;
        if (notFoundPollsRef.current >= 3) setError(t('sing.error.notFound'));
        return;
      }
      notFoundPollsRef.current = 0;
      setQueue(room.queue);
      applyBoards(room);
      setActiveIndex(room.activeVideoIndex);
      setIsPlaying(room.isPlaying ?? false);
      applyTiming(room);
      setReactionsOn(room.reactionsEnabled ?? true);
      setTheme(normalizeDisplayConfig(room.displayConfig).theme);
      processReactions(room.reactions);
      setLoadError(false);
      setLoading(false);
    }, POLL_INTERVAL);
  }, [joinCode, error, processReactions, applyBoards, applyTiming]);

  function handleSongAdded(entry: QueueEntry) {
    // Functional update: the click-closure `queue` can predate a poll that
    // landed mid-await — spreading it would drop or duplicate songs.
    setQueue((prev) =>
      prev.some((e) => e.id === entry.id) ? prev : [...prev, entry]
    );
  }

  async function sendReaction(emoji: string) {
    if (!joinCode || reactionCooldown || !username.trim()) return;
    setReactionCooldown(true);
    setLastSentEmoji(emoji);
    setTimeout(() => setLastSentEmoji(null), 1500);
    setTimeout(() => setReactionCooldown(false), REACTION_COOLDOWN_MS);
    const id = uuidv4();
    // Pop the cheer locally now; the seen-set keeps the next poll from replaying it.
    seenReactionIds.current.add(id);
    spawnReactionPops([{ id, emoji, userName: username.trim(), timestamp: Date.now() }]);
    const ok = await postReaction(joinCode, id, emoji, username.trim());
    if (!ok) setLastSentEmoji(null);
  }

  const upcomingSongs = queue.slice(activeIndex);
  const currentSong = queue[activeIndex];
  const mainClass = `${styles.main} ${THEME_CLASS[theme]}`;

  const myTurn = myTurnState(
    upcomingSongs,
    username,
    estimate,
    isPlaying,
    sessionEndsAt
  );

  if (!joinCode) {
    return <div className={styles.loadingScreen}><div className={styles.spinner} /></div>;
  }

  if (error) {
    return (
      <main className={mainClass}>
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

  if (loadError) {
    return (
      <main className={mainClass}>
        <div className={styles.errorCard}>
          <div className={styles.errorIcon}>📶</div>
          <h2>{t('common.connectionErrorTitle')}</h2>
          <p>{t('common.connectionErrorBody')}</p>
          <button
            className={styles.btnPink}
            onClick={() => {
              setLoadError(false);
              setLoading(true);
              setInitNonce((n) => n + 1);
            }}
          >
            {t('common.retry')}
          </button>
        </div>
      </main>
    );
  }

  const showingNowPlaying = !!(currentSong && isPlaying);
  const queueItems = showingNowPlaying ? upcomingSongs.slice(1) : upcomingSongs;

  // One object for both queue surfaces — the sidebar and the phone drawer show
  // the same room, so they take the same props.
  const queueView = {
    upcoming: upcomingSongs,
    queueItems,
    currentSong,
    isPlaying,
    reactionsOn,
    username,
    estimate,
    sessionEndsAt,
    loading,
    onReaction: sendReaction,
    reactionCooldown,
    lastSentEmoji,
  };

  return (
    <main className={mainClass}>
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
                <BoardsPanel
                  roomId={joinCode}
                  userName={username}
                  boards={boards}
                />
              }
            />
          )}
        </div>

        <SingSidebar {...queueView} />

        <MobileQueueDrawer
          {...queueView}
          open={mobileQueueOpen}
          onOpenChange={setMobileQueueOpen}
          myTurn={myTurn}
        />
      </div>

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
