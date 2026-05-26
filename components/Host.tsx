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
import CheerBar from './CheerBar';
import QrJoinCard from './QrJoinCard';
import SongSearch from './SongSearch';
import getRoom from '../app/queue/getRoom';
import createRoom from '../app/queue/createRoom';
import updatePosition from '../app/queue/updatePosition';
import reorderQueue from '../app/queue/reorderQueue';
import removeFromQueue from '../app/queue/removeFromQueue';
import setPlaying from '../app/queue/setPlaying';
import { broadcastRoomState, onVideoEnded } from '../app/queue/roomChannel';
import setReactionsEnabled from '../app/queue/setReactionsEnabled';
import postReaction from '../app/queue/postReaction';
import { REACTION_COOLDOWN_MS } from '../app/queue/cheerConstants';
import { startSessionTracking } from '../app/queue/trackSession';
import { QueueEntry, Reaction } from '../pages/api/types';
import { v4 as uuidv4 } from 'uuid';

const POLL_INTERVAL = 3000;

function isTextReaction(emoji: string): boolean {
  return emoji.length > 2 && /[a-zA-Z]/.test(emoji);
}

// ─── Icons ───
const Icons = {
  drag: (
    <svg width="12" height="18" viewBox="0 0 12 18" fill="currentColor" opacity="0.3">
      <circle cx="3" cy="3" r="1.5" /><circle cx="9" cy="3" r="1.5" />
      <circle cx="3" cy="9" r="1.5" /><circle cx="9" cy="9" r="1.5" />
      <circle cx="3" cy="15" r="1.5" /><circle cx="9" cy="15" r="1.5" />
    </svg>
  ),
  moveTop: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="2" x2="11" y2="2" /><polyline points="4,9 7,5 10,9" /><line x1="7" y1="5" x2="7" y2="12" />
    </svg>
  ),
  edit: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 2.5l3 3L4.5 12.5H1.5v-3l7-7z" />
    </svg>
  ),
  remove: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="3" x2="11" y2="11" /><line x1="11" y1="3" x2="3" y2="11" />
    </svg>
  ),
  replay: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 2v4h4" /><path d="M3 10a5 5 0 1 0 1-6.5L2 6" />
    </svg>
  ),
  play: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M8 5.5l7 4.5-7 4.5V5.5z" fill="currentColor" />
    </svg>
  ),
  stop: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <rect x="2" y="2" width="12" height="12" rx="2" />
    </svg>
  ),
  prev: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <polyline points="11,4 6,9 11,14" />
    </svg>
  ),
  next: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <polyline points="7,4 12,9 7,14" />
    </svg>
  ),
  gear: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  tv: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="2" width="16" height="11" rx="1.5" /><line x1="6" y1="16" x2="12" y2="16" /><line x1="9" y1="13" x2="9" y2="16" />
    </svg>
  ),
  plus: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="8" y1="3" x2="8" y2="13" /><line x1="3" y1="8" x2="13" y2="8" />
    </svg>
  ),
};

// ─── Settings Popover ───
function SettingsPopover({
  isOpen,
  onClose,
  tvMode,
  onOpenTv,
  onSwitchLocal,
  reactionsOn,
  onToggleReactions,
  hostName,
  onChangeName,
  qrVisible,
  onShowQr,
}: {
  isOpen: boolean;
  onClose: () => void;
  tvMode: boolean;
  onOpenTv: () => void;
  onSwitchLocal: () => void;
  reactionsOn: boolean;
  onToggleReactions: () => void;
  hostName: string;
  onChangeName: () => void;
  qrVisible: boolean;
  onShowQr: () => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    const handler = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as Element).closest(`.${styles.gearBtn}`)) {
        onClose();
      }
    };
    const t = setTimeout(() => document.addEventListener('pointerdown', handler), 10);
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', handler); };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div ref={ref} className={styles.settingsPopover}>
      <div className={styles.spGroup}>
        <div className={styles.spLabel}>Display</div>
        {tvMode ? (
          <button className={styles.spBtn} onClick={onSwitchLocal}>
            {Icons.tv}
            <div>
              <div className={styles.spBtnTitle}>Watch Here</div>
              <div className={styles.spBtnDesc}>Show video in this window</div>
            </div>
          </button>
        ) : (
          <button className={styles.spBtn} onClick={onOpenTv}>
            {Icons.tv}
            <div>
              <div className={styles.spBtnTitle}>Open TV Display</div>
              <div className={styles.spBtnDesc}>Cast to a TV or projector</div>
            </div>
          </button>
        )}
      </div>
      <div className={styles.spSep} />
      <div className={styles.spGroup}>
        <div className={styles.spLabel}>Audience</div>
        <button className={styles.spToggleRow} onClick={onToggleReactions}>
          <div>
            <div className={styles.spBtnTitle}>Reactions</div>
            <div className={styles.spBtnDesc}>
              {reactionsOn ? 'Audience can send cheers' : 'Reactions disabled'}
            </div>
          </div>
          <div className={`${styles.toggle} ${reactionsOn ? styles.toggleOn : ''}`}>
            <div className={styles.toggleThumb} />
          </div>
        </button>
      </div>
      <div className={styles.spSep} />
      <div className={styles.spGroup}>
        <div className={styles.spLabel}>Host</div>
        <button className={styles.spBtn} onClick={onChangeName}>
          {Icons.edit}
          <div>
            <div className={styles.spBtnTitle}>{hostName}</div>
            <div className={styles.spBtnDesc}>Change your name</div>
          </div>
        </button>
      </div>
      {!qrVisible && (
        <>
          <div className={styles.spSep} />
          <div className={styles.spGroup}>
            <div className={styles.spLabel}>QR Code</div>
            <button className={styles.spBtn} onClick={onShowQr}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <rect x="1" y="1" width="6" height="6" rx="1" />
                <rect x="9" y="1" width="6" height="6" rx="1" />
                <rect x="1" y="9" width="6" height="6" rx="1" />
                <rect x="10" y="10" width="2" height="2" />
                <rect x="13" y="10" width="2" height="2" />
                <rect x="10" y="13" width="2" height="2" />
                <rect x="13" y="13" width="2" height="2" />
              </svg>
              <div>
                <div className={styles.spBtnTitle}>Show QR Code</div>
                <div className={styles.spBtnDesc}>Display join code for guests</div>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Sortable queue item ───
function SortableQueueItem({
  item,
  index,
  isFirst,
  editing,
  onMoveTop,
  onEdit,
  onEditSave,
  onRemove,
}: {
  item: QueueEntry;
  index: number;
  isFirst: boolean;
  editing: boolean;
  onMoveTop: () => void;
  onEdit: () => void;
  onEditSave: (name: string) => void;
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

  const [editName, setEditName] = React.useState(item.userName);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (editing) {
      setEditName(item.userName);
      setTimeout(() => inputRef.current?.select(), 50);
    }
  }, [editing, item.userName]);

  const save = () => onEditSave(editName);

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
      className={`${styles.queueItem} ${isDragging ? styles.queueItemDragging : ''} ${editing ? styles.queueItemEditing : ''}`}
    >
      <button
        className={styles.dragHandle}
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        {Icons.drag}
      </button>
      <span className={styles.queueNum}>{index + 1}</span>
      <div className={styles.queueInfo}>
        <div className={styles.queueSingerLine}>
          {editing ? (
            <input
              ref={inputRef}
              className={styles.editInput}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save();
                if (e.key === 'Escape') onEditSave(item.userName);
              }}
            />
          ) : (
            <span className={styles.queueSingerName}>{item.userName}</span>
          )}
        </div>
        <div className={styles.queueSong}>{decodeHtml(item.songTitle)}</div>
      </div>
      <div className={styles.queueActions}>
        {!isFirst && (
          <button className={styles.actionBtn} onClick={onMoveTop} title="Move to top" aria-label="Move to top">
            {Icons.moveTop}
          </button>
        )}
        <button
          className={`${styles.actionBtn} ${editing ? styles.actionBtnActive : ''}`}
          onClick={onEdit}
          title="Edit singer name"
          aria-label="Edit singer name"
        >
          {Icons.edit}
        </button>
        <button className={`${styles.actionBtn} ${styles.removeBtn}`} onClick={onRemove} title="Remove" aria-label="Remove">
          {Icons.remove}
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
  const [confirmRemove, setConfirmRemove] = React.useState<string | null>(null);
  const [tvMode, setTvMode] = React.useState(false);
  const [reactionsOn, setReactionsOn] = React.useState(true);
  const [reactionCooldown, setReactionCooldown] = React.useState(false);
  const [lastSentEmoji, setLastSentEmoji] = React.useState<string | null>(null);
  const [visibleReactions, setVisibleReactions] = React.useState<(Reaction & { key: string; left: number })[]>([]);
  const seenReactionIds = React.useRef(new Set<string>());
  const reactionTimers = React.useRef<ReturnType<typeof setTimeout>[]>([]);
  const videoRef = React.useRef<HTMLIFrameElement>(null);

  // Host name (same pattern as Sing's welcome flow)
  const [hostName, setHostName] = React.useState('');
  const [showWelcome, setShowWelcome] = React.useState(true);
  const [welcomeName, setWelcomeName] = React.useState('');

  React.useEffect(() => {
    const saved = localStorage.getItem('karaoq_host_name');
    if (saved) {
      setWelcomeName(saved);
    }
  }, []);

  function handleWelcomeSubmit() {
    const name = welcomeName.trim();
    if (!name) return;
    setHostName(name);
    localStorage.setItem('karaoq_host_name', name);
    setShowWelcome(false);
  }

  // New state for redesigned layout
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [qrVisible, setQrVisible] = React.useState(true);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const toastTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);


  // Pause polling while the organizer is actively reordering or adding songs
  const [isPaused, setIsPaused] = React.useState(false);
  const isPausedRef = React.useRef(false);
  const pauseTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  React.useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  function showToast(msg: string) {
    setToast(null);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    requestAnimationFrame(() => {
      setToast(msg);
      toastTimer.current = setTimeout(() => setToast(null), 2000);
    });
  }

  function openTvDisplay() {
    window.open(`/display/${joinCode}`, '_blank');
    setTvMode(true);
    setSettingsOpen(false);
    showToast('TV Display opened');
  }

  // Clean up reaction timers on unmount
  React.useEffect(() => {
    const timers = reactionTimers.current;
    return () => {
      timers.forEach(clearTimeout);
    };
  }, []);

  function processReactions(reactions: Reaction[] | undefined) {
    if (!reactions || reactions.length === 0) return;
    const fresh = reactions.filter((r) => !seenReactionIds.current.has(r.id));
    if (fresh.length === 0) return;
    fresh.forEach((r) => seenReactionIds.current.add(r.id));
    if (seenReactionIds.current.size > 200) {
      const entries = Array.from(seenReactionIds.current);
      seenReactionIds.current = new Set(entries.slice(-100));
    }
    const withKeys = fresh.map((r) => ({
      ...r,
      key: r.id,
      left: 10 + Math.random() * 30,
    }));
    setVisibleReactions((prev) => [...prev, ...withKeys]);
    const timer = setTimeout(() => {
      const ids = new Set(fresh.map((r) => r.id));
      setVisibleReactions((prev) => prev.filter((r) => !ids.has(r.key)));
    }, 4000);
    reactionTimers.current.push(timer);
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
        setReactionsOn(room.reactionsEnabled ?? true);
        processReactions(room.reactions);
        setLoading(false);
      } else {
        setError('Room not found');
        setLoading(false);
      }
    }

    init();
    return () => { cancelled = true; };
  }, [joinCode]);

  // Session analytics tracking
  React.useEffect(() => {
    if (!joinCode) return;
    return startSessionTracking(joinCode, hostName || 'Host', 'host');
  }, [joinCode]);

  // Poll for queue updates (pauses during drag operations)
  React.useEffect(() => {
    if (!joinCode || error || isPaused) return;

    const interval = setInterval(async () => {
      const room = await getRoom(joinCode);
      if (room && !isPausedRef.current) {
        setQueue(room.queue);
        setActiveIndex(room.activeVideoIndex);
        setIsPlaying(room.isPlaying ?? false);
        setReactionsOn(room.reactionsEnabled ?? true);
        processReactions(room.reactions);
      }
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [joinCode, error, isPaused]);

  function pausePolling() {
    setIsPaused(true);
    isPausedRef.current = true;
    if (pauseTimeout.current) clearTimeout(pauseTimeout.current);
    pauseTimeout.current = setTimeout(() => {
      setIsPaused(false);
      isPausedRef.current = false;
    }, 5000);
  }

  // ─── Queue operations ───

  function broadcast(q: QueueEntry[], idx: number, playing: boolean) {
    if (!joinCode) return;
    broadcastRoomState(joinCode, { queue: q, activeVideoIndex: idx, isPlaying: playing, reactionsEnabled: reactionsOn });
  }

  // ─── Video end detection ───

  // Use a ref so the postMessage handler always has current state
  const onVideoEndedRef = React.useRef<() => void>(() => {});
  onVideoEndedRef.current = async () => {
    if (!joinCode) return;
    const nextIdx = activeIndex + 1;
    if (nextIdx < queue.length) {
      const ok = await updatePosition(joinCode, nextIdx);
      if (ok) {
        setActiveIndex(nextIdx);
        setIsPlaying(false);
        broadcast(queue, nextIdx, false);
      }
    } else {
      const ok = await setPlaying(joinCode, false);
      if (ok) {
        setIsPlaying(false);
        broadcast(queue, activeIndex, false);
      }
    }
  };

  // All-in-one mode: listen for YouTube postMessage when the video ends
  React.useEffect(() => {
    if (!isPlaying || tvMode) return;

    function onMessage(e: MessageEvent) {
      if (e.origin !== 'https://www.youtube.com') return;
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (
          (data.event === 'onStateChange' && data.info === 0) ||
          (data.event === 'infoDelivery' && data.info?.playerState === 0)
        ) {
          onVideoEndedRef.current();
        }
      } catch {}
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [isPlaying, tvMode]);

  // All-in-one mode: subscribe to YouTube events when iframe loads
  function handleIframeLoad() {
    videoRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'listening', id: 'karaoq' }),
      'https://www.youtube.com'
    );
  }

  // TV mode: listen for video-ended from Display via BroadcastChannel
  React.useEffect(() => {
    if (!joinCode || !tvMode) return;
    return onVideoEnded(joinCode, () => onVideoEndedRef.current());
  }, [joinCode, tvMode]);

  async function sendReaction(emoji: string) {
    if (!joinCode || reactionCooldown) return;
    setReactionCooldown(true);
    setLastSentEmoji(emoji);
    setTimeout(() => setLastSentEmoji(null), 1500);
    setTimeout(() => setReactionCooldown(false), REACTION_COOLDOWN_MS);
    const id = uuidv4();
    await postReaction(joinCode, id, emoji, hostName || 'Host');
  }

  async function toggleReactions() {
    if (!joinCode) return;
    const next = !reactionsOn;
    const ok = await setReactionsEnabled(joinCode, next);
    if (ok) {
      setReactionsOn(next);
      broadcastRoomState(joinCode, { queue, activeVideoIndex: activeIndex, isPlaying, reactionsEnabled: next });
      showToast(next ? 'Reactions enabled' : 'Reactions disabled');
    }
  }

  function handleSongAdded(entry: QueueEntry) {
    pausePolling();
    const newQueue = [...queue, entry];
    setQueue(newQueue);
    broadcast(newQueue, activeIndex, isPlaying);
    showToast(`Added "${decodeHtml(entry.songTitle)}"`);
    setSearchOpen(false);
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
    showToast('Moved to top of queue');
  }

  async function removeSong(entryId: string) {
    if (!joinCode) return;
    pausePolling();

    const entry = queue.find((e) => e.id === entryId);
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
    if (entry) showToast(`Removed "${decodeHtml(entry.songTitle)}"`);
  }

  function editSave(id: string, newName: string) {
    setQueue((prev) => prev.map((e) => (e.id === id ? { ...e, userName: newName } : e)));
    setEditingId(null);
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
  // When the current song is waiting (not playing), include it in the sidebar
  // so the queue doesn't look empty while the player shows "UP NEXT"
  const upNext = currentSong && !isPlaying
    ? queue.slice(activeIndex)
    : queue.slice(activeIndex + 1);
  const historyItems = queue.slice(0, activeIndex);

  const uniqueSingers = new Set(upNext.map((s) => s.userName)).size;

  const joinUrl = origin ? `${origin}/sing/${joinCode}` : '';

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
      {/* ─── Header ─── */}
      <header className={styles.header}>
        <div className={styles.brand} onClick={() => router.push('/')}>
          KaraoQ
        </div>
        <button
          className={`${styles.gearBtn} ${settingsOpen ? styles.gearBtnOpen : ''}`}
          onClick={() => setSettingsOpen(!settingsOpen)}
        >
          {Icons.gear}
        </button>
        <SettingsPopover
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          tvMode={tvMode}
          onOpenTv={openTvDisplay}
          onSwitchLocal={() => { setTvMode(false); setSettingsOpen(false); }}
          reactionsOn={reactionsOn}
          onToggleReactions={toggleReactions}
          hostName={hostName}
          onChangeName={() => { setSettingsOpen(false); setShowWelcome(true); setWelcomeName(hostName); }}
          qrVisible={qrVisible}
          onShowQr={() => { setQrVisible(true); setSettingsOpen(false); }}
        />
      </header>

      {/* ─── Content ─── */}
      <div className={styles.content}>
        {/* Player area */}
        <div className={tvMode ? styles.controlPanel : styles.playerArea}>
          {loading ? (
            <div className={styles.emptyState}>
              <div className={styles.spinner} />
              <p>Loading room...</p>
            </div>
          ) : currentSong ? (
            tvMode ? (
              /* ── TV Display mode: control panel ── */
              <div className={styles.songControl}>
                {isPlaying ? (
                  <>
                    <div className={styles.liveIndicator}>
                      <span className={styles.liveDot} />
                      <span>PLAYING ON DISPLAY</span>
                    </div>
                    <h2 className={styles.controlSong}>{decodeHtml(currentSong.songTitle)}</h2>
                    <p className={styles.controlSinger}>{currentSong.userName}</p>
                    <button className={styles.stopBtn} onClick={stopSong}>
                      {Icons.stop} Stop
                    </button>
                  </>
                ) : (
                  <>
                    <div className={styles.readyLabel}>UP NEXT</div>
                    <h1 className={styles.controlSinger}>{currentSong.userName}</h1>
                    <p className={styles.controlSong}>{decodeHtml(currentSong.songTitle)}</p>
                    <button className={styles.playBtn} onClick={startSong}>
                      {Icons.play} Play on Display
                    </button>
                  </>
                )}
                <button className={styles.switchModeLink} onClick={() => setTvMode(false)}>
                  Show video here instead
                </button>
              </div>
            ) : (
              /* ── All-in-one mode: video plays here ── */
              isPlaying ? (
                <iframe
                  ref={videoRef}
                  key={currentSong.id}
                  className={styles.video}
                  src={`https://www.youtube.com/embed/${currentSong.videoId}?autoplay=1&rel=0&enablejsapi=1`}
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                  onLoad={handleIframeLoad}
                />
              ) : (
                <div className={styles.songControl}>
                  <div className={styles.readyLabel}>UP NEXT</div>
                  <h1 className={styles.controlSinger}>{currentSong.userName}</h1>
                  <p className={styles.controlSong}>{decodeHtml(currentSong.songTitle)}</p>
                </div>
              )
            )
          ) : (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="noteGrad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#ff2d78" />
                      <stop offset="100%" stopColor="#00f0ff" />
                    </linearGradient>
                  </defs>
                  <circle cx="18" cy="48" r="8" fill="url(#noteGrad)" />
                  <circle cx="46" cy="40" r="8" fill="url(#noteGrad)" />
                  <rect x="24" y="8" width="4" height="40" rx="2" fill="url(#noteGrad)" />
                  <rect x="52" y="8" width="4" height="32" rx="2" fill="url(#noteGrad)" />
                  <path d="M26 8 c4-4 22-8 28-4 v8 c-6-4-24 0-28 4z" fill="url(#noteGrad)" />
                </svg>
              </div>
              <h2 className={styles.emptyTitle}>KaraoQ</h2>
              <p>
                {qrVisible ? 'Scan the QR code or visit' : 'Visit'} <strong>{(origin || 'karaoq.live').replace(/^https?:\/\/(www\.)?/, '')}</strong> and enter code <strong>{joinCode}</strong> to add songs and cheer on the singers!
              </p>
            </div>
          )}

          {/* ─── Transport bar ─── */}
          <div className={styles.transport}>
            <div className={styles.transportMain}>
              <div className={styles.transportInfo}>
                {currentSong ? (
                  <div className={styles.transportStatus}>
                    <div className={`${styles.tLabel} ${isPlaying ? styles.tLabelPlaying : styles.tLabelReady}`}>
                      {isPlaying && <span className={styles.tDot} />}
                      {isPlaying ? 'ON STAGE' : 'UP NEXT'}
                    </div>
                    <div className={styles.tSinger}>
                      {currentSong.userName}
                    </div>
                    <div className={styles.tSong}>
                      {decodeHtml(currentSong.songTitle)}
                    </div>
                  </div>
                ) : (
                  <div className={styles.transportStatus}>
                    <div className={`${styles.tLabel} ${styles.tLabelEmpty}`}>WAITING</div>
                    <div className={styles.tSong}>No songs in queue</div>
                  </div>
                )}
              </div>
              <div className={styles.transportControls}>
                <button className={styles.tBtn} onClick={playPrevious} disabled={activeIndex <= 0} title="Previous">
                  {Icons.prev}
                </button>
                {isPlaying && !tvMode ? (
                  // In all-in-one mode, YouTube's native controls handle pause/resume
                  null
                ) : (
                  <button className={`${styles.tBtn} ${styles.tPlay}`} onClick={startSong} disabled={!currentSong} title="Play">
                    {Icons.play}
                  </button>
                )}
                <button className={styles.tBtn} onClick={playNext} disabled={activeIndex + 1 >= queue.length} title="Next Song">
                  {Icons.next}
                </button>
              </div>
            </div>
            <div className={styles.transportFooter}>
              <span className={styles.transportLogo}>KaraoQ</span>
              <a href="https://variationsonastring.com" target="_blank" rel="noopener noreferrer" className={styles.transportLink}>
                made with <span className={styles.transportHeart}>&#9829;</span> by variations on a string
              </a>
            </div>
          </div>
        </div>

        {/* Reaction overlay */}
        {reactionsOn && visibleReactions.length > 0 && (
          <div className={styles.reactionOverlay}>
            {visibleReactions.map((r) => (
              <div key={r.key} className={styles.reactionBubble} style={{ left: `${r.left}%` }}>
                {isTextReaction(r.emoji) ? (
                  <span className={styles.reactionText}>{r.emoji}</span>
                ) : (
                  <span className={styles.reactionEmoji}>{r.emoji}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ─── Sidebar ─── */}
        <div className={styles.sidebar}>
          {/* QR code section */}
          {qrVisible && joinUrl && (
            <QrJoinCard
              joinUrl={joinUrl}
              joinCode={joinCode || ''}
              origin={origin}
              onClose={() => setQrVisible(false)}
              onPrint={() => {
                window.open(`/print/${joinCode}`, '_blank');
                fetch('/api/analytics/print', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ roomId: joinCode }),
                }).catch(() => {});
              }}
            />
          )}

          {/* Sidebar header */}
          <div className={styles.sidebarHeader}>
            <div className={styles.sidebarTitle}>
              Up Next
              {upNext.length > 0 && <span className={styles.sidebarBadge}>{upNext.length}</span>}
            </div>
            <div className={styles.sidebarActions}>
              <button
                className={`${styles.sidebarAct} ${searchOpen ? styles.sidebarActActive : ''}`}
                onClick={() => setSearchOpen(!searchOpen)}
              >
                {Icons.plus} Add Song
              </button>
            </div>
          </div>

          {/* Queue stats */}
          {upNext.length > 0 && (
            <div className={styles.queueStats}>
              <span>{upNext.length} song{upNext.length !== 1 ? 's' : ''}</span>
              <span className={styles.statDot} />
              <span>{uniqueSingers} singer{uniqueSingers !== 1 ? 's' : ''}</span>
            </div>
          )}

          {/* Queue list */}
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
                      editing={editingId === item.id}
                      onMoveTop={() => moveToTop(item.id)}
                      onEdit={() => setEditingId(editingId === item.id ? null : item.id)}
                      onEditSave={(name) => editSave(item.id, name)}
                      onRemove={() => setConfirmRemove(item.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <p className={styles.emptyQueue}>No songs queued yet</p>
          )}

          {/* Host cheer bar — below the queue */}
          {reactionsOn && isPlaying && currentSong && (
            <CheerBar
              onReaction={sendReaction}
              cooldown={reactionCooldown}
              lastSentEmoji={lastSentEmoji}
            />
          )}

          {/* History drawer */}
          <button
            className={`${styles.historyToggle} ${historyOpen ? styles.historyToggleOpen : ''}`}
            onClick={() => setHistoryOpen(!historyOpen)}
          >
            <svg width="10" height="6" viewBox="0 0 10 6" fill="currentColor">
              <path d="M0 0l5 6 5-6z" />
            </svg>
            History
            {historyItems.length > 0 && <span className={styles.historyBadge}>{historyItems.length}</span>}
          </button>
          {historyOpen && (
            <div className={styles.historyList}>
              {historyItems.length > 0 ? (
                [...historyItems].reverse().map((item, i) => (
                  <div key={item.id} className={styles.historyItem}>
                    <span className={styles.historyNum}>{historyItems.length - i}</span>
                    <div className={styles.queueInfo}>
                      <div className={styles.queueSong}>{decodeHtml(item.songTitle)}</div>
                      <div className={styles.queueArtist}>{item.userName}</div>
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
                      {Icons.replay}
                    </button>
                  </div>
                ))
              ) : (
                <p className={styles.emptyQueue}>No songs played yet</p>
              )}
            </div>
          )}

          {/* Search overlay */}
          {searchOpen && joinCode && (
            <div className={styles.searchOverlay}>
              <div className={styles.searchOverlayHead}>
                <button className={styles.searchClose} onClick={() => setSearchOpen(false)} title="Close search">
                  ×
                </button>
              </div>
              <SongSearch
                roomId={joinCode}
                userName={hostName || 'Host'}
                onSongAdded={handleSongAdded}
                showFilters={false}
                requireName={false}
              />
            </div>
          )}
        </div>
      </div>

      {/* ─── Confirm modal ─── */}
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
              <button className={styles.btnDanger} onClick={() => removeSong(confirmRemove)}>
                Remove
              </button>
              <button className={styles.btnGhost} onClick={() => setConfirmRemove(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Toast ─── */}
      {toast && <div className={styles.toast} key={toast}>{toast}</div>}

      {/* ─── Welcome name prompt ─── */}
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
