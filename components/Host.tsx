import * as React from 'react';
import { useRouter } from 'next/router';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import styles from '../styles/Host.module.css';
import getRoom from '../app/queue/getRoom';
import createRoom from '../app/queue/createRoom';
import updatePosition from '../app/queue/updatePosition';
import reorderQueue from '../app/queue/reorderQueue';
import removeFromQueue from '../app/queue/removeFromQueue';
import setPlaying from '../app/queue/setPlaying';
import { broadcastRoomState } from '../app/queue/roomChannel';
import { QueueEntry } from '../pages/api/types';

const POLL_INTERVAL = 3000;

type SidebarTab = 'upcoming' | 'history';

// ─── Sortable queue item ───
function SortableQueueItem({
  item,
  index,
  isFirst,
  isLast,
  onMoveTop,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  item: QueueEntry;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onMoveTop: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.queueItem} ${isDragging ? styles.queueItemDragging : ''}`}
    >
      <button
        className={styles.dragHandle}
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <svg width="12" height="18" viewBox="0 0 12 18" fill="currentColor">
          <circle cx="3" cy="3" r="1.5" />
          <circle cx="9" cy="3" r="1.5" />
          <circle cx="3" cy="9" r="1.5" />
          <circle cx="9" cy="9" r="1.5" />
          <circle cx="3" cy="15" r="1.5" />
          <circle cx="9" cy="15" r="1.5" />
        </svg>
      </button>
      <span className={styles.queueNum}>{index + 1}</span>
      <div className={styles.queueInfo}>
        <span className={styles.queueSong}>
          {decodeHtml(item.songTitle)}
        </span>
        <span className={styles.queueSinger}>{item.userName}</span>
      </div>
      <div className={styles.queueActions}>
        {!isFirst && (
          <>
            <button
              className={styles.actionBtn}
              onClick={onMoveTop}
              title="Move to top"
              aria-label="Move to top"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="2" x2="11" y2="2" />
                <polyline points="4,9 7,5 10,9" />
                <line x1="7" y1="5" x2="7" y2="12" />
              </svg>
            </button>
            <button
              className={styles.actionBtn}
              onClick={onMoveUp}
              title="Move up"
              aria-label="Move up"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="4,9 7,4 10,9" />
              </svg>
            </button>
          </>
        )}
        {!isLast && (
          <button
            className={styles.actionBtn}
            onClick={onMoveDown}
            title="Move down"
            aria-label="Move down"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="4,5 7,10 10,5" />
            </svg>
          </button>
        )}
        <button
          className={`${styles.actionBtn} ${styles.removeBtn}`}
          onClick={onRemove}
          title="Remove from queue"
          aria-label="Remove from queue"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="3" x2="11" y2="11" />
            <line x1="11" y1="3" x2="3" y2="11" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Main Host component ───
const Host = (): React.ReactElement => {
  const router = useRouter();
  const joinCode = router.query.joinCode as string | undefined;

  const [queue, setQueue] = React.useState<QueueEntry[]>([]);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [origin, setOrigin] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<SidebarTab>('upcoming');
  const [confirmRemove, setConfirmRemove] = React.useState<string | null>(null);
  const [tvMode, setTvMode] = React.useState(false);

  // Pause polling while the organizer is actively reordering
  const [isPaused, setIsPaused] = React.useState(false);
  const pauseTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  React.useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  function openTvDisplay() {
    window.open(`/display/${joinCode}`, '_blank');
    setTvMode(true);
  }

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

  // Poll for queue updates (pauses during drag operations)
  React.useEffect(() => {
    if (!joinCode || error || isPaused) return;

    const interval = setInterval(async () => {
      const room = await getRoom(joinCode);
      if (room) {
        setQueue(room.queue);
        setActiveIndex(room.activeVideoIndex);
        setIsPlaying(room.isPlaying ?? false);
      }
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [joinCode, error, isPaused]);

  function pausePolling() {
    setIsPaused(true);
    if (pauseTimeout.current) clearTimeout(pauseTimeout.current);
    pauseTimeout.current = setTimeout(() => setIsPaused(false), 5000);
  }

  // ─── Queue operations ───

  function broadcast(q: QueueEntry[], idx: number, playing: boolean) {
    if (!joinCode) return;
    broadcastRoomState(joinCode, { queue: q, activeVideoIndex: idx, isPlaying: playing });
  }

  async function playNext() {
    if (!joinCode) return;
    const nextIndex = activeIndex + 1;
    if (nextIndex >= queue.length) return;
    const ok = await updatePosition(joinCode, nextIndex);
    if (ok) {
      setActiveIndex(nextIndex);
      setIsPlaying(false);
      broadcast(queue, nextIndex, false);
    }
  }

  async function playPrevious() {
    if (!joinCode) return;
    const prevIndex = activeIndex - 1;
    if (prevIndex < 0) return;
    const ok = await updatePosition(joinCode, prevIndex);
    if (ok) {
      setActiveIndex(prevIndex);
      setIsPlaying(false);
      broadcast(queue, prevIndex, false);
    }
  }

  async function startSong() {
    if (!joinCode) return;
    const ok = await setPlaying(joinCode, true);
    if (ok) {
      setIsPlaying(true);
      broadcast(queue, activeIndex, true);
    }
  }

  async function stopSong() {
    if (!joinCode) return;
    const ok = await setPlaying(joinCode, false);
    if (ok) {
      setIsPlaying(false);
      broadcast(queue, activeIndex, false);
    }
  }

  async function handleReorder(newUpcoming: QueueEntry[]) {
    if (!joinCode) return;
    pausePolling();
    const history = queue.slice(0, activeIndex + 1);
    const newQueue = [...history, ...newUpcoming];
    setQueue(newQueue);
    await reorderQueue(joinCode, newQueue, activeIndex);
    broadcast(newQueue, activeIndex, isPlaying);
  }

  async function moveToTop(entryId: string) {
    const upNext = queue.slice(activeIndex + 1);
    const idx = upNext.findIndex((e) => e.id === entryId);
    if (idx <= 0) return;
    const moved = arrayMove(upNext, idx, 0);
    await handleReorder(moved);
  }

  async function moveUp(entryId: string) {
    const upNext = queue.slice(activeIndex + 1);
    const idx = upNext.findIndex((e) => e.id === entryId);
    if (idx <= 0) return;
    const moved = arrayMove(upNext, idx, idx - 1);
    await handleReorder(moved);
  }

  async function moveDown(entryId: string) {
    const upNext = queue.slice(activeIndex + 1);
    const idx = upNext.findIndex((e) => e.id === entryId);
    if (idx === -1 || idx >= upNext.length - 1) return;
    const moved = arrayMove(upNext, idx, idx + 1);
    await handleReorder(moved);
  }

  async function removeSong(entryId: string) {
    if (!joinCode) return;
    pausePolling();

    const entryIndex = queue.findIndex((e) => e.id === entryId);
    if (entryIndex === -1) return;

    const newQueue = queue.filter((e) => e.id !== entryId);
    let newActiveIndex = activeIndex;
    if (entryIndex < activeIndex) {
      newActiveIndex = Math.max(0, newActiveIndex - 1);
    } else if (entryIndex === activeIndex) {
      newActiveIndex = Math.min(newActiveIndex, Math.max(0, newQueue.length - 1));
    }

    setQueue(newQueue);
    setActiveIndex(newActiveIndex);
    setConfirmRemove(null);
    broadcast(newQueue, newActiveIndex, isPlaying);
    await removeFromQueue(joinCode, entryId);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const upNext = queue.slice(activeIndex + 1);
    const oldIndex = upNext.findIndex((e) => e.id === active.id);
    const newIndex = upNext.findIndex((e) => e.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const moved = arrayMove(upNext, oldIndex, newIndex);
    handleReorder(moved);
  }

  const currentSong = queue[activeIndex];
  const upNext = queue.slice(activeIndex + 1);
  const history = queue.slice(0, activeIndex);

  // Count unique singers in the upcoming queue
  const singerCounts = upNext.reduce<Record<string, number>>((acc, item) => {
    acc[item.userName] = (acc[item.userName] || 0) + 1;
    return acc;
  }, {});
  const uniqueSingers = Object.keys(singerCounts).length;

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
            {origin || 'karaoq.live'}
          </span>
          <span className={styles.joinLabel}>CODE</span>
          <span className={styles.joinCode}>{joinCode}</span>
        </div>
        <div className={styles.headerControls}>
          {!tvMode && (
            <button
              className={styles.tvBtn}
              onClick={openTvDisplay}
              title="Opens a clean display in a new tab — perfect for casting to a TV or projector"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="2" width="14" height="10" rx="1" />
                <line x1="5" y1="14" x2="11" y2="14" />
                <line x1="8" y1="12" x2="8" y2="14" />
              </svg>
              Open TV Display
            </button>
          )}
          <button
            className={styles.prevBtn}
            onClick={playPrevious}
            disabled={activeIndex <= 0}
            title="Go back to previous song"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="10,3 5,8 10,13" />
            </svg>
            Previous
          </button>
          <button
            className={styles.nextBtn}
            onClick={playNext}
            disabled={activeIndex + 1 >= queue.length}
          >
            Next Song
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="6,3 11,8 6,13" />
            </svg>
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className={styles.content}>
        {/* Player area: video inline OR control panel depending on mode */}
        <div className={tvMode ? styles.controlPanel : styles.playerArea}>
          {loading ? (
            <div className={styles.emptyState}>
              <div className={styles.spinner} />
              <p>Loading room...</p>
            </div>
          ) : currentSong ? (
            tvMode ? (
              /* ── Display mode: control panel only ── */
              <div className={styles.songControl}>
                {isPlaying ? (
                  <>
                    <div className={styles.liveIndicator}>
                      <span className={styles.liveDot} />
                      <span>PLAYING ON DISPLAY</span>
                    </div>
                    <h2 className={styles.controlSong}>
                      {decodeHtml(currentSong.songTitle)}
                    </h2>
                    <p className={styles.controlSinger}>{currentSong.userName}</p>
                    <button className={styles.stopBtn} onClick={stopSong}>
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
                        <rect x="3" y="3" width="12" height="12" rx="2" />
                      </svg>
                      Stop
                    </button>
                  </>
                ) : (
                  <>
                    <div className={styles.readyLabel}>UP NEXT</div>
                    <h2 className={styles.controlSong}>
                      {decodeHtml(currentSong.songTitle)}
                    </h2>
                    <p className={styles.controlSinger}>{currentSong.userName}</p>
                    <button className={styles.playBtn} onClick={startSong}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="6,3 20,12 6,21" />
                      </svg>
                      Play on Display
                    </button>
                  </>
                )}
                <button
                  className={styles.switchModeLink}
                  onClick={() => setTvMode(false)}
                >
                  Show video here instead
                </button>
              </div>
            ) : (
              /* ── All-in-one mode: video plays here ── */
              isPlaying ? (
                <>
                  <iframe
                    key={currentSong.id}
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
                    <button className={styles.inlineStopBtn} onClick={stopSong}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                        <rect x="2" y="2" width="10" height="10" rx="1.5" />
                      </svg>
                    </button>
                  </div>
                </>
              ) : (
                <div className={styles.songControl}>
                  <div className={styles.readyLabel}>UP NEXT</div>
                  <h2 className={styles.controlSong}>
                    {decodeHtml(currentSong.songTitle)}
                  </h2>
                  <p className={styles.controlSinger}>{currentSong.userName}</p>
                  <button className={styles.playBtn} onClick={startSong}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="6,3 20,12 6,21" />
                    </svg>
                    Play
                  </button>
                </div>
              )
            )
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
          {/* Tabs */}
          <div className={styles.tabBar}>
            <button
              className={`${styles.tab} ${activeTab === 'upcoming' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('upcoming')}
            >
              Up Next
              {upNext.length > 0 && (
                <span className={styles.tabBadge}>{upNext.length}</span>
              )}
            </button>
            <button
              className={`${styles.tab} ${activeTab === 'history' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('history')}
            >
              History
              {history.length > 0 && (
                <span className={styles.tabBadgeHistory}>{history.length}</span>
              )}
            </button>
          </div>

          {/* Upcoming tab */}
          {activeTab === 'upcoming' && (
            <>
              {upNext.length > 0 && (
                <div className={styles.queueStats}>
                  <span>{upNext.length} song{upNext.length !== 1 ? 's' : ''}</span>
                  <span className={styles.statDot} />
                  <span>{uniqueSingers} singer{uniqueSingers !== 1 ? 's' : ''}</span>
                </div>
              )}
              {upNext.length > 0 ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={upNext.map((e) => e.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className={styles.queueList}>
                      {upNext.map((item, i) => (
                        <SortableQueueItem
                          key={item.id}
                          item={item}
                          index={i}
                          isFirst={i === 0}
                          isLast={i === upNext.length - 1}
                          onMoveTop={() => moveToTop(item.id)}
                          onMoveUp={() => moveUp(item.id)}
                          onMoveDown={() => moveDown(item.id)}
                          onRemove={() => setConfirmRemove(item.id)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : (
                <p className={styles.emptyQueue}>No songs queued yet</p>
              )}
            </>
          )}

          {/* History tab */}
          {activeTab === 'history' && (
            <>
              {history.length > 0 ? (
                <div className={styles.queueList}>
                  {[...history].reverse().map((item, i) => (
                    <div key={item.id} className={styles.historyItem}>
                      <span className={styles.historyNum}>
                        {history.length - i}
                      </span>
                      <div className={styles.queueInfo}>
                        <span className={styles.queueSong}>
                          {decodeHtml(item.songTitle)}
                        </span>
                        <span className={styles.queueSinger}>
                          {item.userName}
                        </span>
                      </div>
                      <button
                        className={styles.replayBtn}
                        onClick={async () => {
                          if (!joinCode) return;
                          const idx = queue.findIndex((e) => e.id === item.id);
                          if (idx !== -1) {
                            const ok = await updatePosition(joinCode, idx);
                            if (ok) {
                              setActiveIndex(idx);
                              setIsPlaying(false);
                              broadcast(queue, idx, false);
                            }
                          }
                        }}
                        title="Replay this song"
                        aria-label="Replay this song"
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 2v4h4" />
                          <path d="M3 10a5 5 0 1 0 1-6.5L2 6" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.emptyQueue}>
                  No songs played yet — history will appear here
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Remove confirmation modal */}
      {confirmRemove && (
        <div className={styles.overlay} onClick={() => setConfirmRemove(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Remove from queue?</h3>
            <p className={styles.modalText}>
              {(() => {
                const entry = queue.find((e) => e.id === confirmRemove);
                if (!entry) return 'This song will be removed from the queue.';
                return `Remove "${decodeHtml(entry.songTitle)}" by ${entry.userName}?`;
              })()}
            </p>
            <div className={styles.modalActions}>
              <button
                className={styles.btnDanger}
                onClick={() => removeSong(confirmRemove)}
              >
                Remove
              </button>
              <button
                className={styles.btnGhost}
                onClick={() => setConfirmRemove(null)}
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

function decodeHtml(html: string): string {
  if (typeof document === 'undefined') return html;
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  return txt.value;
}

export default Host;
