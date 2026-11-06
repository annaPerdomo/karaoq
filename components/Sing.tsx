import * as React from 'react';
import { useRouter } from 'next/router';

import styles from '../styles/Sing.module.css';
import SongSearch from './SongSearch';
import BoardsPanel from './BoardsPanel';
import getRoom from '../app/queue/getRoom';
import useBoards from '../app/queue/useBoards';
import { normalizeRoomId } from '../lib/roomCode';
import { startSessionTracking } from '../app/queue/trackSession';
import { startVisiblePolling } from '../app/queue/pollWhileVisible';
import { DORMANT_POLL_MS, isRoomDormant } from '../lib/roomDormancy';
import { useSearchBackNotice } from '../app/queue/useSearchBackNotice';
import SearchBackToast from './search/SearchBackToast';
import { DisplayTheme, QueueEntry, Room, RoomBrand, roomTheme } from '../pages/api/types';
import { brandStyle } from '../lib/brandStyle';
import { useT } from '../lib/i18n/I18nProvider';
import SingSidebar from './sing/SingSidebar';
import SingFooter from './sing/SingFooter';
import SingErrorCard from './sing/SingErrorCard';
import MobileQueueDrawer from './sing/MobileQueueDrawer';
import WelcomeOverlay from './sing/WelcomeOverlay';
import ReactionPops from './sing/ReactionPops';
import { useCheers } from './sing/hooks/useCheers';
import { useGuestIdentity } from './sing/hooks/useGuestIdentity';
import { useJoinVia } from './sing/hooks/useJoinVia';
import SingHeader from './sing/SingHeader';
import TipsBanner from './sing/TipsBanner';
import { myTurnState } from './sing/YourTurnCard';
import postponeEntry from '../app/queue/postponeEntry';
import { useRoomTiming } from './hooks/useRoomTiming';


const POLL_INTERVAL = 8000;

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
  const searchBack = useSearchBackNotice();
  const applySearchBack = searchBack.applyRoom;
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [reactionsOn, setReactionsOn] = React.useState(true);
  const [theme, setTheme] = React.useState<DisplayTheme>('classic');
  const [brand, setBrand] = React.useState<RoomBrand>({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [loadError, setLoadError] = React.useState(false);
  const [initNonce, setInitNonce] = React.useState(0);
  const notFoundPollsRef = React.useRef(0);
  const dormantRef = React.useRef(false);
  const [mobileQueueOpen, setMobileQueueOpen] = React.useState(false);
  const identity = useGuestIdentity(joinCode);
  const { username, showWelcome, trackedName } = identity;
  const cheers = useCheers(joinCode, username);
  const { processReactions } = cheers;

  // Same contract as Host's adminPeek: /sing/CODE?admin=1 is Anna checking on
  // a room from /admin, so she must not register as a participant or mark the
  // room live.
  const adminPeek = router.query.admin === '1';

  const viaRef = useJoinVia(router);

  React.useEffect(() => {
    // A guest who skipped the name prompt still counts, with an empty name.
    if (!joinCode || showWelcome || adminPeek) return;
    return startSessionTracking(joinCode, trackedName, 'singer', viaRef.current);
  }, [joinCode, trackedName, showWelcome, adminPeek]);

  const timing = useRoomTiming({
    queue,
    activeVideoIndex: activeIndex,
    isPlaying,
  });
  const { estimate, sessionEndsAt } = timing;
  const applyTiming = timing.adoptRoom;

  // animateReactions=false on the first load only seeds the seen-set.
  function adoptRoom(room: Room, animateReactions = true) {
    dormantRef.current = isRoomDormant(room);
    setQueue(room.queue);
    applyBoards(room);
    setActiveIndex(room.activeVideoIndex);
    setIsPlaying(room.isPlaying ?? false);
    applyTiming(room);
    setReactionsOn(room.reactionsEnabled ?? true);
    setTheme(roomTheme(room));
    setBrand(room.brand ?? {});
    applySearchBack(room);
    processReactions(room.reactions, animateReactions);
  }

  React.useEffect(() => {
    if (!joinCode) return;

    let cancelled = false;
    async function init() {
      const room = await getRoom(joinCode!, { wake: true });
      if (cancelled) return;
      if (room === "notFound") {
        setError(t('sing.error.notFound'));
      } else if (room === "error") {
        setLoadError(true);
      } else {
        adoptRoom(room, false);
        setLoadError(false);
      }
      setLoading(false);
    }
    init();
    return () => { cancelled = true; };
  }, [joinCode, processReactions, initNonce, applyBoards, applyTiming, applySearchBack]);

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
      adoptRoom(room);
      setLoadError(false);
      setLoading(false);
    }, () => (dormantRef.current ? DORMANT_POLL_MS : POLL_INTERVAL));
  }, [joinCode, error, processReactions, applyBoards, applyTiming, applySearchBack]);

  function handleSongAdded(entry: QueueEntry) {
    // Functional update: the click-closure `queue` can predate a poll that
    // landed mid-await — spreading it would drop or duplicate songs.
    setQueue((prev) =>
      prev.some((e) => e.id === entry.id) ? prev : [...prev, entry]
    );
  }

  // The server decides the slot, and the next poll is a full interval away — too long
  // to leave the card saying "up next".
  async function postpone(entryId: string, after: number | 'end'): Promise<boolean> {
    if (!joinCode) return false;
    const ok = await postponeEntry(joinCode, entryId, after);
    const room = await getRoom(joinCode);
    if (typeof room !== 'string') adoptRoom(room);
    return ok;
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
        <SingErrorCard
          variant="notFound"
          message={error}
          onGoHome={() => router.push('/')}
        />
      </main>
    );
  }

  if (loadError) {
    return (
      <main className={mainClass}>
        <SingErrorCard
          variant="connection"
          onRetry={() => {
            setLoadError(false);
            setLoading(true);
            setInitNonce((n) => n + 1);
          }}
        />
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
    onReaction: cheers.sendReaction,
    reactionCooldown: cheers.cooldown,
    lastSentEmoji: cheers.lastSentEmoji,
    cheerNudge: cheers.cheerNudge,
    onPostpone: postpone,
  };

  return (
    <main className={mainClass} style={brandStyle(brand) as React.CSSProperties}>
      <SearchBackToast show={searchBack.show} onDismiss={searchBack.dismiss} />
      <SingHeader joinCode={joinCode} />

      <div className={styles.content}>
        <div
          className={`${styles.searchPanel} ${showingNowPlaying && reactionsOn ? styles.searchPanelCheer : ''}`}
        >
          {!showWelcome && identity.showTipsBanner && (
            <TipsBanner username={username} onDismiss={identity.dismissTips} />
          )}
          {joinCode && (
            <SongSearch
              roomId={joinCode}
              userName={username}
              onSongAdded={handleSongAdded}
              showFilters={false}
              showNameInput={true}
              onNameChange={identity.setUsername}
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

          {joinCode && <SingFooter roomId={joinCode} />}
        </div>

        <SingSidebar {...queueView} />

        <MobileQueueDrawer
          {...queueView}
          open={mobileQueueOpen}
          onOpenChange={setMobileQueueOpen}
          myTurn={myTurn}
        />
      </div>

      {reactionsOn && cheers.visibleReactions.length > 0 && (
        <ReactionPops reactions={cheers.visibleReactions} />
      )}

      {showWelcome && !loading && !error && (
        <WelcomeOverlay
          joinCode={joinCode}
          onSubmit={identity.handleWelcomeSubmit}
          onSkip={identity.skipName}
          onStage={showingNowPlaying && reactionsOn ? currentSong : undefined}
          onCheer={(emoji) => cheers.sendReaction(emoji, 'welcome')}
          cooldown={cheers.cooldown}
          lastSentEmoji={cheers.lastSentEmoji}
        />
      )}

    </main>
  );
};

export default Sing;
