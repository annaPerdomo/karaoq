import * as React from "react";
import { useRouter } from "next/router";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { QRCodeSVG } from "qrcode.react";
import styles from "../styles/Host.module.css";
import CheerBar from "./CheerBar";
import { rememberLastHostedRoom } from "../lib/lastRoom";
import { normalizeRoomId } from "../lib/roomCode";
import SongSearch from "./SongSearch";
import getRoom from "../app/queue/getRoom";
import createRoom from "../app/queue/createRoom";
import updatePosition from "../app/queue/updatePosition";
import reorderQueue from "../app/queue/reorderQueue";
import removeFromQueue from "../app/queue/removeFromQueue";
import setPlaying from "../app/queue/setPlaying";
import { broadcastRoomState, onVideoEnded } from "../app/queue/roomChannel";
import setReactionsEnabled from "../app/queue/setReactionsEnabled";
import postReaction from "../app/queue/postReaction";
import { REACTION_COOLDOWN_MS } from "../app/queue/cheerConstants";
import { startSessionTracking } from "../app/queue/trackSession";
import { QueueEntry, Reaction } from "../pages/api/types";
import { v4 as uuidv4 } from "uuid";

const POLL_INTERVAL = 3000;

type PlayMode = "here" | "tv";

function playModeStorageKey(joinCode: string): string {
  return `karaoq_play_mode_${joinCode}`;
}

function qrHiddenStorageKey(joinCode: string): string {
  return `karaoq_qr_hidden_${joinCode}`;
}

function isTextReaction(emoji: string): boolean {
  return emoji.length > 2 && /[a-zA-Z]/.test(emoji);
}

// ─── Icons ───
const Icons = {
  drag: (
    <svg
      width="12"
      height="18"
      viewBox="0 0 12 18"
      fill="currentColor"
      opacity="0.3"
    >
      <circle cx="3" cy="3" r="1.5" />
      <circle cx="9" cy="3" r="1.5" />
      <circle cx="3" cy="9" r="1.5" />
      <circle cx="9" cy="9" r="1.5" />
      <circle cx="3" cy="15" r="1.5" />
      <circle cx="9" cy="15" r="1.5" />
    </svg>
  ),
  moveTop: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <line x1="3" y1="2" x2="11" y2="2" />
      <polyline points="4,9 7,5 10,9" />
      <line x1="7" y1="5" x2="7" y2="12" />
    </svg>
  ),
  edit: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8.5 2.5l3 3L4.5 12.5H1.5v-3l7-7z" />
    </svg>
  ),
  remove: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <line x1="3" y1="3" x2="11" y2="11" />
      <line x1="11" y1="3" x2="3" y2="11" />
    </svg>
  ),
  replay: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 2v4h4" />
      <path d="M3 10a5 5 0 1 0 1-6.5L2 6" />
    </svg>
  ),
  play: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle
        cx="10"
        cy="10"
        r="9"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      <path d="M8 5.5l7 4.5-7 4.5V5.5z" fill="currentColor" />
    </svg>
  ),
  stop: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <rect x="2" y="2" width="12" height="12" rx="2" />
    </svg>
  ),
  prev: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <polyline points="11,4 6,9 11,14" />
    </svg>
  ),
  next: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <polyline points="7,4 12,9 7,14" />
    </svg>
  ),
  gear: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  tv: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="1" y="2" width="16" height="11" rx="1.5" />
      <line x1="6" y1="16" x2="12" y2="16" />
      <line x1="9" y1="13" x2="9" y2="16" />
    </svg>
  ),
  monitor: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="3" width="14" height="9" rx="1.5" />
      <path d="M9 12v3" />
      <path d="M5 15.5h8" />
    </svg>
  ),
  users: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 15.5v-1.2a2.8 2.8 0 00-2.8-2.8H5.3a2.8 2.8 0 00-2.8 2.8v1.2" />
      <circle cx="7.25" cy="5.5" r="2.5" />
      <path d="M15.5 15.5v-1.2a2.8 2.8 0 00-2.1-2.7" />
      <path d="M11.5 3.1a2.5 2.5 0 010 4.8" />
    </svg>
  ),
  plus: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <line x1="8" y1="3" x2="8" y2="13" />
      <line x1="3" y1="8" x2="13" y2="8" />
    </svg>
  ),
  caret: (
    <svg width="10" height="6" viewBox="0 0 10 6" fill="currentColor">
      <path d="M0 0l5 6 5-6z" />
    </svg>
  ),
  chevronRight: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="5,3 10,7 5,11" />
    </svg>
  ),
};

// ─── Settings popover ───
// The room's "set once" controls: audience reactions, the co-host invite, and
// the host's name. Playback mode lives in the header pill, and inviting singers
// lives in the Invite panel.
function SettingsPopover({
  isOpen,
  onClose,
  remote,
  reactionsOn,
  onToggleReactions,
  hostName,
  onChangeName,
  onInviteCohost,
}: {
  isOpen: boolean;
  onClose: () => void;
  remote: boolean;
  reactionsOn: boolean;
  onToggleReactions: () => void;
  hostName: string;
  onChangeName: () => void;
  onInviteCohost: () => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    const handler = (e: PointerEvent) => {
      if (
        ref.current &&
        !ref.current.contains(e.target as Node) &&
        !(e.target as Element).closest(`.${styles.gearBtn}`)
      ) {
        onClose();
      }
    };
    const t = setTimeout(
      () => document.addEventListener("pointerdown", handler),
      10,
    );
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", handler);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div ref={ref} className={styles.settingsPopover}>
      {!remote && (
        <>
          <div className={styles.spGroup}>
            <div className={styles.spLabel}>Audience</div>
            <button className={styles.spToggleRow} onClick={onToggleReactions}>
              <div>
                <div className={styles.spBtnTitle}>Reactions</div>
                <div className={styles.spBtnDesc}>
                  {reactionsOn
                    ? "Audience can send cheers"
                    : "Reactions disabled"}
                </div>
              </div>
              <div
                className={`${styles.toggle} ${reactionsOn ? styles.toggleOn : ""}`}
              >
                <div className={styles.toggleThumb} />
              </div>
            </button>
          </div>
          <div className={styles.spSep} />
          <div className={styles.spGroup}>
            <div className={styles.spLabel}>Co-hosts</div>
            <button className={styles.spBtn} onClick={onInviteCohost}>
              {Icons.users}
              <div>
                <div className={styles.spBtnTitle}>Bring on a co-host</div>
                <div className={styles.spBtnDesc}>
                  Show a QR code or copy a link so a friend can manage the queue.
                </div>
              </div>
            </button>
          </div>
          <div className={styles.spSep} />
        </>
      )}
      <div className={styles.spGroup}>
        <div className={styles.spLabel}>{remote ? "Co-host" : "Host"}</div>
        <button className={styles.spBtn} onClick={onChangeName}>
          {Icons.edit}
          <div>
            <div className={styles.spBtnTitle}>{hostName}</div>
            <div className={styles.spBtnDesc}>Change your name</div>
          </div>
        </button>
      </div>
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
      className={`${styles.queueItem} ${isDragging ? styles.queueItemDragging : ""} ${editing ? styles.queueItemEditing : ""}`}
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
                if (e.key === "Enter") save();
                if (e.key === "Escape") onEditSave(item.userName);
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
          <button
            className={styles.actionBtn}
            onClick={onMoveTop}
            title="Move to top"
            aria-label="Move to top"
          >
            {Icons.moveTop}
          </button>
        )}
        <button
          className={`${styles.actionBtn} ${editing ? styles.actionBtnActive : ""}`}
          onClick={onEdit}
          title="Edit singer name"
          aria-label="Edit singer name"
        >
          {Icons.edit}
        </button>
        <button
          className={`${styles.actionBtn} ${styles.removeBtn}`}
          onClick={onRemove}
          title="Remove"
          aria-label="Remove"
        >
          {Icons.remove}
        </button>
      </div>
    </div>
  );
}

// ─── Main Host component ───
// `remote` renders a co-host control surface: it manages the queue (add /
// remove / reorder / restore) but never embeds the player, never controls
// transport, and never resets playback — so it can't disrupt the song playing
// on the real host screen.
const Host = ({
  remote = false,
}: { remote?: boolean } = {}): React.ReactElement => {
  const router = useRouter();
  const joinCode = normalizeRoomId(router.query.joinCode) as string | undefined;

  const [queue, setQueue] = React.useState<QueueEntry[]>([]);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [origin, setOrigin] = React.useState("");
  const [confirmRemove, setConfirmRemove] = React.useState<string | null>(null);
  const [reactionsOn, setReactionsOn] = React.useState(true);
  const [reactionCooldown, setReactionCooldown] = React.useState(false);
  const [lastSentEmoji, setLastSentEmoji] = React.useState<string | null>(null);
  const [visibleReactions, setVisibleReactions] = React.useState<
    (Reaction & { key: string; left: number })[]
  >([]);
  const seenReactionIds = React.useRef(new Set<string>());
  const reactionTimers = React.useRef<ReturnType<typeof setTimeout>[]>([]);
  const videoRef = React.useRef<HTMLIFrameElement>(null);

  // ─── Where the video plays. `null` until the host has chosen (or we've
  // restored a previous choice), which is what triggers the first-run chooser.
  // Co-hosts never play video, so they stay in the default "here" surface.
  const [playMode, setPlayMode] = React.useState<PlayMode | null>(
    remote ? "here" : null,
  );
  // Whether we've checked localStorage for a remembered choice yet. The chooser
  // must wait for this — otherwise a remembered host would be re-prompted in the
  // window before the restore lands.
  const [playModeRestored, setPlayModeRestored] = React.useState(false);
  const tvMode = playMode === "tv";

  const [hostName, setHostName] = React.useState("");
  const [showWelcome, setShowWelcome] = React.useState(true);
  const [welcomeName, setWelcomeName] = React.useState("");

  // A name from a previous session (or set on the landing page when starting
  // the queue) means we can skip the welcome prompt entirely on reload.
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem("karaoq_host_name");
      if (saved) {
        setHostName(saved);
        setWelcomeName(saved);
        setShowWelcome(false);
      }
    } catch {}
  }, []);

  function handleWelcomeSubmit() {
    const name = welcomeName.trim();
    if (!name) return;
    setHostName(name);
    try {
      localStorage.setItem("karaoq_host_name", name);
    } catch {}
    setShowWelcome(false);
  }

  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [modeMenuOpen, setModeMenuOpen] = React.useState(false);
  const [cohostOpen, setCohostOpen] = React.useState(false);
  // The join QR sits in a drawer the host can tuck away — handy when this
  // screen is what's cast and the code isn't needed mid-song. Starts closed to
  // avoid a flash on narrow screens; the restore effect opens it on wide
  // screens (and honors the per-room choice). A tap opens a big, scannable
  // popout.
  const [qrShelfOpen, setQrShelfOpen] = React.useState(false);
  const [qrModalOpen, setQrModalOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [sidebarTab, setSidebarTab] = React.useState<"queue" | "history">(
    "queue",
  );
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const toastTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pause polling while the organizer is actively reordering or adding songs
  const [isPaused, setIsPaused] = React.useState(false);
  const isPausedRef = React.useRef(false);
  const pauseTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  React.useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Restore where this device last played video for this room, so a refresh
  // keeps the host's setup instead of re-asking. Runs the moment we know the
  // room code — independent of room loading — so the chooser never flashes.
  React.useEffect(() => {
    if (remote) {
      setPlayModeRestored(true);
      return;
    }
    if (!joinCode) return;
    try {
      const saved = localStorage.getItem(playModeStorageKey(joinCode));
      // Default new hosts to "here" — the zero-setup option — so the room is
      // immediately usable instead of blocking on a first-run chooser. They can
      // switch to a separate TV anytime from the mode pill up top.
      setPlayMode(saved === "tv" ? "tv" : "here");
    } catch {
      setPlayMode("here");
    }
    setPlayModeRestored(true);
  }, [joinCode, remote]);

  // Restore whether this host had the join QR open for this room; fall back to
  // open on wide screens, tucked away on narrow ones.
  React.useEffect(() => {
    if (!joinCode) return;
    try {
      const saved = localStorage.getItem(qrHiddenStorageKey(joinCode));
      setQrShelfOpen(saved === null ? window.innerWidth > 1024 : saved !== "1");
    } catch {
      setQrShelfOpen(window.innerWidth > 1024);
    }
  }, [joinCode]);

  function toggleQrShelf() {
    const next = !qrShelfOpen;
    setQrShelfOpen(next);
    if (joinCode) {
      try {
        localStorage.setItem(qrHiddenStorageKey(joinCode), next ? "0" : "1");
      } catch {}
    }
  }

  function showToast(msg: string) {
    setToast(null);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    requestAnimationFrame(() => {
      setToast(msg);
      toastTimer.current = setTimeout(() => setToast(null), 2000);
    });
  }

  function rememberMode(mode: PlayMode) {
    if (joinCode) {
      try {
        localStorage.setItem(playModeStorageKey(joinCode), mode);
      } catch {}
    }
  }

  // Choose "this screen" — the simplest setup, nothing else to open.
  function playHere() {
    setPlayMode("here");
    rememberMode("here");
    setModeMenuOpen(false);
  }

  // Choose "separate TV" — open (or re-open) the display window to cast.
  function openTvDisplay() {
    window.open(`/display/${joinCode}`, "_blank");
    setPlayMode("tv");
    rememberMode("tv");
    setModeMenuOpen(false);
    showToast("Display window opened");
  }

  async function copyCohostLink() {
    if (!joinCode) return;
    const base = origin || window.location.origin;
    const url = `${base}/remote/${joinCode}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Co-host link copied");
    } catch {
      showToast(url);
    }
  }

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

  React.useEffect(() => {
    if (!joinCode) return;

    let cancelled = false;

    async function init() {
      // A co-host only reads the room — never create it (createRoom resets
      // isPlaying, which would stop the song on the real host screen).
      if (!remote) await createRoom(joinCode!);
      const room = await getRoom(joinCode!);
      if (cancelled) return;
      if (room) {
        // Mark this as the device's current room so the landing page offers
        // "resume" instead of a duplicate. Co-hosts don't own the room.
        if (!remote) rememberLastHostedRoom(joinCode!);
        setQueue(room.queue);
        setActiveIndex(room.activeVideoIndex);
        setIsPlaying(room.isPlaying ?? false);
        setReactionsOn(room.reactionsEnabled ?? true);
        processReactions(room.reactions);
        setLoading(false);
      } else {
        setError("Room not found");
        setLoading(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [joinCode, remote]);

  React.useEffect(() => {
    if (!joinCode) return;
    return startSessionTracking(joinCode, hostName || "Host", "host");
  }, [joinCode, hostName]);

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
    broadcastRoomState(joinCode, {
      queue: q,
      activeVideoIndex: idx,
      isPlaying: playing,
      reactionsEnabled: reactionsOn,
    });
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
    if (remote || !isPlaying || tvMode) return;

    function onMessage(e: MessageEvent) {
      if (e.origin !== "https://www.youtube.com") return;
      try {
        const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (
          (data.event === "onStateChange" && data.info === 0) ||
          (data.event === "infoDelivery" && data.info?.playerState === 0)
        ) {
          onVideoEndedRef.current();
        }
      } catch {}
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [isPlaying, tvMode, remote]);

  // All-in-one mode: subscribe to YouTube events when iframe loads
  function handleIframeLoad() {
    videoRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "listening", id: "karaoq" }),
      "https://www.youtube.com",
    );
  }

  // TV mode: listen for video-ended from Display via BroadcastChannel
  React.useEffect(() => {
    if (remote || !joinCode || !tvMode) return;
    return onVideoEnded(joinCode, () => onVideoEndedRef.current());
  }, [joinCode, tvMode, remote]);

  async function sendReaction(emoji: string) {
    if (!joinCode || reactionCooldown) return;
    setReactionCooldown(true);
    setLastSentEmoji(emoji);
    setTimeout(() => setLastSentEmoji(null), 1500);
    setTimeout(() => setReactionCooldown(false), REACTION_COOLDOWN_MS);
    const id = uuidv4();
    await postReaction(joinCode, id, emoji, hostName || "Host");
  }

  async function toggleReactions() {
    if (!joinCode) return;
    const next = !reactionsOn;
    const ok = await setReactionsEnabled(joinCode, next);
    if (ok) {
      setReactionsOn(next);
      broadcastRoomState(joinCode, {
        queue,
        activeVideoIndex: activeIndex,
        isPlaying,
        reactionsEnabled: next,
      });
      showToast(next ? "Reactions enabled" : "Reactions disabled");
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

  async function handleReorder(
    newUpcoming: QueueEntry[],
    start = activeIndex + 1,
  ) {
    if (!joinCode) return;
    pausePolling();
    const history = queue.slice(0, start);
    const newQueue = [...history, ...newUpcoming];
    setQueue(newQueue);
    await reorderQueue(joinCode, newQueue, activeIndex);
    broadcast(newQueue, activeIndex, isPlaying);
  }

  async function moveToTop(entryId: string) {
    if (!joinCode) return;

    if (!isPlaying) {
      // Paused: the current "UP NEXT" song is part of the list, so move within
      // queue.slice(activeIndex) to keep the clicked song at activeIndex.
      const fullUpcoming = queue.slice(activeIndex);
      const idx = fullUpcoming.findIndex((e) => e.id === entryId);
      if (idx <= 0) return;
      const moved = arrayMove(fullUpcoming, idx, 0);

      pausePolling();
      const history = queue.slice(0, activeIndex);
      const newQueue = [...history, ...moved];
      setQueue(newQueue);
      await reorderQueue(joinCode, newQueue, activeIndex);
      broadcast(newQueue, activeIndex, isPlaying);
    } else {
      const upcoming = queue.slice(activeIndex + 1);
      const idx = upcoming.findIndex((e) => e.id === entryId);
      if (idx <= 0) return;
      const moved = arrayMove(upcoming, idx, 0);
      await handleReorder(moved);
    }
    showToast("Moved to top of queue");
  }

  // Move one history entry back into the queue as the next song, leaving the
  // rest of history and the active pointer in place.
  async function replayFromHistory(entryId: string) {
    if (!joinCode) return;

    const idx = queue.findIndex((e) => e.id === entryId);
    if (idx === -1 || idx >= activeIndex) return;

    const entry = queue[idx];
    const withoutSong = queue.filter((e) => e.id !== entryId);
    // Removing a history entry shifts the active song down by one; slot the
    // restored song right after it (or at the top when nothing is playing).
    const newActiveIndex = activeIndex - 1;
    const insertAt = isPlaying ? activeIndex : newActiveIndex;
    const newQueue = [
      ...withoutSong.slice(0, insertAt),
      entry,
      ...withoutSong.slice(insertAt),
    ];

    pausePolling();
    setQueue(newQueue);
    setActiveIndex(newActiveIndex);
    await reorderQueue(joinCode, newQueue, newActiveIndex);
    broadcast(newQueue, newActiveIndex, isPlaying);
    showToast(`Restored "${decodeHtml(entry.songTitle)}"`);
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
    }

    setQueue(newQueue);
    setActiveIndex(newActiveIndex);
    setConfirmRemove(null);
    broadcast(newQueue, newActiveIndex, isPlaying);
    await removeFromQueue(joinCode, entryId);
    if (entry) showToast(`Removed "${decodeHtml(entry.songTitle)}"`);
  }

  function editSave(id: string, newName: string) {
    setQueue((prev) =>
      prev.map((e) => (e.id === id ? { ...e, userName: newName } : e)),
    );
    setEditingId(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Match the rendered list: when paused, the on-stage "next up" song is part
    // of the sidebar (queue.slice(activeIndex)); otherwise it starts after it.
    const includesCurrent = !!(queue[activeIndex] && !isPlaying);
    const start = includesCurrent ? activeIndex : activeIndex + 1;
    const upNext = queue.slice(start);
    const oldIndex = upNext.findIndex((e) => e.id === active.id);
    const newIndex = upNext.findIndex((e) => e.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const moved = arrayMove(upNext, oldIndex, newIndex);
    handleReorder(moved, start);
  }

  const currentSong = queue[activeIndex];
  // Keep the waiting current song in the sidebar so it isn't empty during "UP NEXT".
  const includesCurrent = !!(currentSong && !isPlaying);
  const upNext = includesCurrent
    ? queue.slice(activeIndex)
    : queue.slice(activeIndex + 1);
  const historyItems = queue.slice(0, activeIndex);

  const uniqueSingers = new Set(upNext.map((s) => s.userName)).size;

  const joinUrl = origin ? `${origin}/sing/${joinCode}` : "";
  const cohostUrl = origin ? `${origin}/remote/${joinCode}` : "";
  const displayUrl = (origin || "karaoq.live").replace(
    /^https?:\/\/(www\.)?/,
    "",
  );
  const cohostDisplayUrl = cohostUrl.replace(/^https?:\/\/(www\.)?/, "");

  function printQr() {
    window.open(`/print/${joinCode}`, "_blank");
    fetch("/api/analytics/print", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: joinCode }),
    }).catch(() => {});
  }

  if (!joinCode) return <div className={styles.loading}>Loading...</div>;

  if (error) {
    return (
      <main className={styles.main}>
        <div className={styles.errorCard}>
          <h2>Oops!</h2>
          <p>{error}</p>
          <button className={styles.btn} onClick={() => router.push("/")}>
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
        <div className={styles.brand} onClick={() => router.push("/")}>
          KaraoQ
          {remote && <span className={styles.cohostBadge}>Co-host</span>}
        </div>

        {/* Playback-mode pill — always shows where the video is playing and
            switches in one tap. */}
        {!remote && (
          <div className={styles.modePillWrap}>
            <button
              className={styles.modePill}
              onClick={() => {
                setModeMenuOpen((o) => !o);
                setSettingsOpen(false);
              }}
              title="Where the karaoke video is playing"
            >
              {tvMode ? Icons.tv : Icons.monitor}
              <span className={styles.modePillText}>
                {tvMode ? "Playing on a different screen" : "Playing here"}
              </span>
              <span className={styles.modePillCaret}>{Icons.caret}</span>
            </button>
            {modeMenuOpen && (
              <>
                <div
                  className={styles.menuBackdrop}
                  onClick={() => setModeMenuOpen(false)}
                />
                <div className={styles.modeMenu}>
                  <div className={styles.spLabel}>Where the video plays</div>
                  <button
                    className={`${styles.modeMenuItem} ${!tvMode ? styles.modeMenuItemActive : ""}`}
                    onClick={playHere}
                  >
                    {Icons.monitor}
                    <div>
                      <div className={styles.spBtnTitle}>On this screen</div>
                      <div className={styles.spBtnDesc}>
                        Video plays right here
                      </div>
                    </div>
                    {!tvMode && <span className={styles.modeCheck}>✓</span>}
                  </button>
                  <button
                    className={`${styles.modeMenuItem} ${tvMode ? styles.modeMenuItemActive : ""}`}
                    onClick={openTvDisplay}
                  >
                    {Icons.tv}
                    <div>
                      <div className={styles.spBtnTitle}>
                        On a different screen
                      </div>
                      <div className={styles.spBtnDesc}>
                        {tvMode
                          ? "Re-open the display window"
                          : "Cast to a TV or projector"}
                      </div>
                    </div>
                    {tvMode && <span className={styles.modeCheck}>✓</span>}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <div className={styles.headerActions}>
          <button
            className={`${styles.gearBtn} ${settingsOpen ? styles.gearBtnOpen : ""}`}
            onClick={() => {
              setSettingsOpen(!settingsOpen);
              setModeMenuOpen(false);
            }}
            aria-label="Settings"
          >
            {Icons.gear}
          </button>
        </div>
        <SettingsPopover
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          remote={remote}
          reactionsOn={reactionsOn}
          onToggleReactions={toggleReactions}
          hostName={hostName}
          onChangeName={() => {
            setSettingsOpen(false);
            setShowWelcome(true);
            setWelcomeName(hostName);
          }}
          onInviteCohost={() => {
            setSettingsOpen(false);
            setCohostOpen(true);
          }}
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
            remote ? (
              /* ── Co-host mode: status only, no player or audio ── */
              <div className={styles.songControl}>
                {isPlaying ? (
                  <div className={styles.liveIndicator}>
                    <span className={styles.liveDot} />
                    <span>NOW PLAYING</span>
                  </div>
                ) : (
                  <div className={styles.readyLabel}>UP NEXT</div>
                )}
                <h1 className={styles.controlSinger}>{currentSong.userName}</h1>
                <p className={styles.controlSong}>
                  {decodeHtml(currentSong.songTitle)}
                </p>
                <p className={styles.cohostNote}>
                  Playback is controlled on the host screen
                </p>
              </div>
            ) : tvMode ? (
              /* ── TV Display mode: status panel; playback runs from the
                   transport bar so there's one set of controls. ── */
              <div className={styles.songControl}>
                {isPlaying ? (
                  <>
                    <div className={styles.liveIndicator}>
                      <span className={styles.liveDot} />
                      <span>PLAYING ON A DIFFERENT SCREEN</span>
                    </div>
                    <p className={styles.controlSinger}>
                      {currentSong.userName}
                    </p>
                    <h2 className={styles.controlSong}>
                      {decodeHtml(currentSong.songTitle)}
                    </h2>
                  </>
                ) : (
                  <>
                    <div className={styles.readyLabel}>UP NEXT</div>
                    <h1 className={styles.controlSinger}>
                      {currentSong.userName}
                    </h1>
                    <p className={styles.controlSong}>
                      {decodeHtml(currentSong.songTitle)}
                    </p>
                  </>
                )}
                <button
                  className={styles.switchModeLink}
                  onClick={openTvDisplay}
                >
                  Display window closed? Re-open it
                </button>
              </div>
            ) : /* ── All-in-one mode: video plays here ── */
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
                <p className={styles.controlSong}>
                  {decodeHtml(currentSong.songTitle)}
                </p>
              </div>
            )
          ) : remote ? (
            /* ── Co-host, empty queue ── */
            <div className={styles.emptyState}>
              <h2 className={`${styles.emptyTitle} ${styles.emptyTitleBrand}`}>
                KaraoQ
              </h2>
              <p>
                No songs in the queue yet. Add songs from the panel — playback
                is controlled on the host screen.
              </p>
            </div>
          ) : (
            /* ── Host, empty queue: make the room playable right now. Adding
                 the first song is the primary action; inviting guests to pile
                 on is offered as a secondary step. ── */
            <div className={styles.emptyState}>
              <div className={styles.emptyStage}>
                <h2 className={styles.emptyTitle}>Your stage is ready</h2>
                <p className={styles.emptyStageLede}>
                  Add the first song and start singing — guests can join and
                  pile on the queue anytime.
                </p>
                <button
                  className={styles.emptyAddBtn}
                  onClick={() => setSearchOpen(true)}
                >
                  {Icons.plus} Add the first song
                </button>
              </div>

              <div className={styles.emptyInvite}>
                <span className={styles.emptyInviteLabel}>
                  Want the room adding songs too? Have them join:
                </span>
                <div className={styles.emptyInviteRow}>
                  {joinUrl && (
                    <div className={styles.emptyInviteQr}>
                      <QRCodeSVG
                        value={joinUrl}
                        size={92}
                        bgColor="transparent"
                        fgColor="#ffffff"
                        level="M"
                      />
                    </div>
                  )}
                  <div className={styles.emptyInviteInfo}>
                    <div className={styles.emptyJoinKicker}>
                      Scan, or visit {displayUrl}
                    </div>
                    <div className={styles.emptyInviteCode}>
                      {joinCode?.toUpperCase()}
                    </div>
                    <button className={styles.emptyJoinPrint} onClick={printQr}>
                      Print join code
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── Transport bar (host only — co-hosts don't control playback) ─── */}
          {!remote && (
            <div className={styles.transport}>
              <div className={styles.transportMain}>
                <div className={styles.transportInfo}>
                  {currentSong ? (
                    <div className={styles.transportStatus}>
                      <div
                        className={`${styles.tLabel} ${isPlaying ? styles.tLabelPlaying : styles.tLabelReady}`}
                      >
                        {isPlaying && <span className={styles.tDot} />}
                        {isPlaying ? "ON STAGE" : "UP NEXT"}
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
                      <div className={`${styles.tLabel} ${styles.tLabelEmpty}`}>
                        WAITING
                      </div>
                      <div className={styles.tSong}>No songs in queue</div>
                    </div>
                  )}
                </div>
                <div className={styles.transportControls}>
                  <button
                    className={styles.tBtn}
                    onClick={playPrevious}
                    disabled={activeIndex <= 0}
                    title="Previous"
                  >
                    {Icons.prev}
                  </button>
                  {isPlaying ? (
                    // While playing on a TV the host needs a Stop here; in
                    // all-in-one mode YouTube's own controls handle pause.
                    tvMode ? (
                      <button
                        className={`${styles.tBtn} ${styles.tStop}`}
                        onClick={stopSong}
                        title="Stop"
                      >
                        {Icons.stop}
                      </button>
                    ) : null
                  ) : (
                    <button
                      className={`${styles.tBtn} ${styles.tPlay}`}
                      onClick={startSong}
                      disabled={!currentSong}
                      title={tvMode ? "Play on the other screen" : "Play"}
                    >
                      {Icons.play}
                    </button>
                  )}
                  <button
                    className={styles.tBtn}
                    onClick={playNext}
                    disabled={activeIndex + 1 >= queue.length}
                    title="Next Song"
                  >
                    {Icons.next}
                  </button>
                </div>
              </div>
              <div className={styles.transportFooter}>
                <span className={styles.transportLogo}>KaraoQ</span>
                <a
                  href="https://variationsonastring.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.transportLink}
                >
                  made with{" "}
                  <span className={styles.transportHeart}>&#9829;</span> by
                  variations on a string
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Reaction overlay */}
        {!remote && reactionsOn && visibleReactions.length > 0 && (
          <div className={styles.reactionOverlay}>
            {visibleReactions.map((r) => (
              <div
                key={r.key}
                className={styles.reactionBubble}
                style={{ left: `${r.left}%` }}
              >
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
        <div
          className={`${styles.sidebar} ${sidebarCollapsed ? styles.sidebarCollapsed : ""}`}
        >
          {sidebarCollapsed ? (
            <button
              className={styles.sidebarReopen}
              onClick={() => setSidebarCollapsed(false)}
              title="Show queue"
              aria-label="Show queue"
            >
              <span className={styles.sidebarReopenIcon}>
                {Icons.chevronRight}
              </span>
              <span className={styles.sidebarReopenLabel}>Up Next</span>
              {upNext.length > 0 && (
                <span className={styles.sidebarBadge}>{upNext.length}</span>
              )}
            </button>
          ) : (
            <>
              {/* Sidebar header: two tabs (Up Next / History) + collapse. */}
              <div className={styles.sidebarHeader}>
                <div className={styles.sidebarTabs}>
                  <button
                    className={`${styles.sidebarTab} ${sidebarTab === "queue" ? styles.sidebarTabActive : ""}`}
                    onClick={() => setSidebarTab("queue")}
                  >
                    Up Next
                    {upNext.length > 0 && (
                      <span className={styles.sidebarBadge}>
                        {upNext.length}
                      </span>
                    )}
                  </button>
                  <button
                    className={`${styles.sidebarTab} ${sidebarTab === "history" ? styles.sidebarTabActive : ""}`}
                    onClick={() => setSidebarTab("history")}
                  >
                    History
                    {historyItems.length > 0 && (
                      <span className={styles.historyBadge}>
                        {historyItems.length}
                      </span>
                    )}
                  </button>
                </div>
                <button
                  className={styles.sidebarCollapseBtn}
                  onClick={() => setSidebarCollapsed(true)}
                  title="Hide panel"
                  aria-label="Hide panel"
                >
                  {Icons.chevronRight}
                </button>
              </div>

              {/* Primary action: add a song. */}
              <button
                className={`${styles.addSongBtn} ${searchOpen ? styles.addSongBtnActive : ""}`}
                onClick={() => setSearchOpen(!searchOpen)}
              >
                {Icons.plus} Add a song
              </button>

              {/* Up Next tab */}
              {sidebarTab === "queue" && (
                <>
                  {upNext.length > 0 && (
                    <div className={styles.queueStats}>
                      <span>
                        {upNext.length} song{upNext.length !== 1 ? "s" : ""}
                      </span>
                      <span className={styles.statDot} />
                      <span>
                        {uniqueSingers} singer{uniqueSingers !== 1 ? "s" : ""}
                      </span>
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
                              editing={editingId === item.id}
                              onMoveTop={() => moveToTop(item.id)}
                              onEdit={() =>
                                setEditingId(
                                  editingId === item.id ? null : item.id,
                                )
                              }
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
                </>
              )}

              {/* History tab */}
              {sidebarTab === "history" && (
                <div className={styles.historyList}>
                  {historyItems.length > 0 ? (
                    [...historyItems].reverse().map((item, i) => (
                      <div key={item.id} className={styles.historyItem}>
                        <span className={styles.historyNum}>
                          {historyItems.length - i}
                        </span>
                        <div className={styles.queueInfo}>
                          <div className={styles.queueArtist}>
                            {item.userName}
                          </div>
                          <div className={styles.queueSong}>
                            {decodeHtml(item.songTitle)}
                          </div>
                        </div>
                        <button
                          className={styles.replayBtn}
                          onClick={() => replayFromHistory(item.id)}
                          title="Restore this song to the queue"
                          aria-label="Restore this song to the queue"
                        >
                          {Icons.replay}
                          <span className={styles.replayBtnLabel}>Restore</span>
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className={styles.emptyQueue}>No songs played yet</p>
                  )}
                </div>
              )}

              {/* Bottom cluster, pinned below the queue:
                  - Cheers, contextual (only while a song is on stage).
                  - The "Scan to join" QR card (same component/wording as the
                    Display screen) so guests can scan all night, with its own
                    print + hide controls. A host can tuck it away (remembered
                    per-room) and restore it from the slim "Show join code"
                    button. */}
              <div className={styles.sidebarBottom}>
                {!remote && reactionsOn && isPlaying && currentSong && (
                  <div className={styles.cheersLive}>
                    <CheerBar
                      onReaction={sendReaction}
                      cooldown={reactionCooldown}
                      lastSentEmoji={lastSentEmoji}
                    />
                  </div>
                )}
                {!remote && joinUrl && (
                  <>
                    <button
                      className={`${styles.drawerToggle} ${qrShelfOpen ? styles.drawerToggleOpen : ""}`}
                      onClick={toggleQrShelf}
                      aria-expanded={qrShelfOpen}
                    >
                      <svg
                        className={styles.drawerCaret}
                        width="10"
                        height="6"
                        viewBox="0 0 10 6"
                        fill="currentColor"
                      >
                        <path d="M0 0l5 6 5-6z" />
                      </svg>
                      Scan to join
                    </button>
                    {qrShelfOpen && (
                      <div className={styles.qrShelf}>
                        <button
                          className={styles.qrShelfThumb}
                          onClick={() => setQrModalOpen(true)}
                          title="Enlarge QR code"
                          aria-label="Enlarge QR code"
                        >
                          <QRCodeSVG
                            value={joinUrl}
                            size={72}
                            bgColor="transparent"
                            fgColor="#ffffff"
                            level="M"
                          />
                        </button>
                        <div className={styles.qrShelfInfo}>
                          <span className={styles.qrShelfHint}>
                            Tap code to enlarge
                          </span>
                          <span className={styles.qrShelfAlt}>
                            or visit <strong>{displayUrl}</strong> and enter
                          </span>
                          <span className={styles.qrShelfCode}>
                            {(joinCode || "").toUpperCase()}
                          </span>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Search overlay */}
              {searchOpen && joinCode && (
                <div className={styles.searchOverlay}>
                  <div className={styles.searchOverlayHead}>
                    <button
                      className={styles.searchClose}
                      onClick={() => setSearchOpen(false)}
                      title="Close search"
                    >
                      ×
                    </button>
                  </div>
                  <SongSearch
                    roomId={joinCode}
                    userName={hostName || "Host"}
                    onSongAdded={handleSongAdded}
                    showFilters={false}
                    requireName={false}
                    role="host"
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ─── Co-host invite modal ─── */}
      {cohostOpen && (
        <div className={styles.overlay} onClick={() => setCohostOpen(false)}>
          <div className={styles.invitePanel} onClick={(e) => e.stopPropagation()}>
            <button
              className={styles.qrModalClose}
              onClick={() => setCohostOpen(false)}
              title="Close"
              aria-label="Close"
            >
              &times;
            </button>
            <h3 className={styles.inviteTitle}>Bring on a co-host</h3>
            <p className={styles.cohostLede}>
              A co-host helps you run the night from their own phone. Here is
              how to add one:
            </p>
            <ol className={styles.cohostSteps}>
              <li>Have your co-host scan the code below, or send them the link.</li>
              <li>It opens karaoq on their phone, ready to help.</li>
              <li>They can search for songs and manage the queue.</li>
              <li>You stay in charge of playing, pausing, and skipping.</li>
            </ol>
            {cohostUrl && (
              <div className={styles.qrModalCode}>
                <QRCodeSVG
                  value={cohostUrl}
                  size={220}
                  bgColor="transparent"
                  fgColor="#00f0ff"
                  level="M"
                />
              </div>
            )}
            <p className={styles.qrModalScan}>Scan</p>
            <p className={styles.qrModalAlt}>
              or send them this link:
            </p>
            <p className={styles.cohostLink}>
              <strong>{cohostDisplayUrl}</strong>
            </p>
            <button className={styles.qrModalPrint} onClick={copyCohostLink}>
              Copy co-host link
            </button>
          </div>
        </div>
      )}

      {/* ─── QR code popout (enlarge) ─── */}
      {qrModalOpen && joinUrl && (
        <div className={styles.overlay} onClick={() => setQrModalOpen(false)}>
          <div className={styles.invitePanel} onClick={(e) => e.stopPropagation()}>
            <button
              className={styles.qrModalClose}
              onClick={() => setQrModalOpen(false)}
              title="Close"
              aria-label="Close"
            >
              &times;
            </button>
            <div className={styles.qrModalCode}>
              <QRCodeSVG
                value={joinUrl}
                size={260}
                bgColor="transparent"
                fgColor="#ffffff"
                level="M"
              />
            </div>
            <p className={styles.qrModalScan}>Scan to join</p>
            <p className={styles.qrModalAlt}>
              or visit <strong>{displayUrl}</strong> and enter code{" "}
              <strong className={styles.qrShelfCode}>
                {(joinCode || "").toUpperCase()}
              </strong>
            </p>
          </div>
        </div>
      )}

      {/* ─── Confirm remove modal ─── */}
      {confirmRemove && (
        <div className={styles.overlay} onClick={() => setConfirmRemove(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Remove from queue?</h3>
            <p className={styles.modalText}>
              {(() => {
                const entry = queue.find((e) => e.id === confirmRemove);
                if (!entry) return "This song will be removed from the queue.";
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

      {/* ─── Toast ─── */}
      {toast && (
        <div className={styles.toast} key={toast}>
          {toast}
        </div>
      )}

      {/* ─── Welcome name prompt ─── */}
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
              onKeyDown={(e) => e.key === "Enter" && handleWelcomeSubmit()}
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
  if (typeof document === "undefined") return html;
  const txt = document.createElement("textarea");
  txt.innerHTML = html;
  return txt.value;
}

export default Host;
