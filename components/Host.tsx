import * as React from "react";
import { useRouter } from "next/router";
import { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import styles from "../styles/Host.module.css";
import { rememberLastHostedRoom } from "../lib/lastRoom";
import { normalizeRoomId } from "../lib/roomCode";
import getRoom from "../app/queue/getRoom";
import useBoards from "../app/queue/useBoards";
import createRoom from "../app/queue/createRoom";
import updatePosition from "../app/queue/updatePosition";
import reorderQueue from "../app/queue/reorderQueue";
import removeFromQueue from "../app/queue/removeFromQueue";
import renameQueueEntry from "../app/queue/renameQueueEntry";
import setPlaying from "../app/queue/setPlaying";
import savePlayMode from "../app/queue/setPlayMode";
import saveDisplayPaused from "../app/queue/setDisplayPaused";
import {
  broadcastRoomState,
  broadcastDisplayPause,
  onVideoEnded,
} from "../app/queue/roomChannel";
import setReactionsEnabled from "../app/queue/setReactionsEnabled";
import setFairMode from "../app/queue/setFairMode";
import { fairInsertIndex } from "../lib/fairQueue";
import postReaction from "../app/queue/postReaction";
import { REACTION_COOLDOWN_MS } from "../app/queue/cheerConstants";
import { startSessionTracking } from "../app/queue/trackSession";
import { startVisiblePolling } from "../app/queue/pollWhileVisible";
import {
  DEFAULT_DISPLAY_CONFIG,
  DEFAULT_HOST_CONFIG,
  DisplayConfig,
  DisplayTheme,
  HostConfig,
  normalizeDisplayConfig,
  normalizeHostConfig,
  PlayMode,
  QueueEntry,
  Reaction,
  Room,
} from "../pages/api/types";
import { v4 as uuidv4 } from "uuid";
import { useT } from "../lib/i18n/I18nProvider";
import { POLL_INTERVAL, DISPLAY_GONE_CONFIRM_MS } from "./host/constants";
import { formatSongTitle } from "./host/utils";
import {
  playModeStorageKey,
  readStoredPlayToken,
  storePlayToken,
  mirrorPlayTokenForRestore,
  qrHiddenStorageKey,
  cheersHiddenStorageKey,
} from "./host/storage";
import { ReactionOverlay } from "./host/ReactionOverlay";
import { MobileFooter } from "./host/MobileFooter";
import { CohostInviteModal } from "./host/CohostInviteModal";
import { QrModal } from "./host/QrModal";
import { ConfirmRemoveModal } from "./host/ConfirmRemoveModal";
import { WelcomePrompt } from "./host/WelcomePrompt";
import { HostHeader } from "./host/HostHeader";
import { SongStage } from "./host/SongStage";
import { TransportBar } from "./host/TransportBar";
import { QueueSidebar } from "./host/QueueSidebar";
import { useHostEdit } from "./host/edit/useHostEdit";
import { HostEditRail } from "./host/edit/HostEditRail";
import { EditOverlay } from "./edit/EditOverlay";

// Each theme repaints the host surface's CSS vars; classic is the default look.
const HOST_THEME_CLASS: Record<DisplayTheme, string> = {
  classic: "",
  minimal: styles.themeMinimal,
  neon: styles.themeNeon,
};

// `remote` renders a co-host control surface: it manages the queue (add /
// remove / reorder / restore) but never embeds the player, never controls
// transport, and never resets playback — so it can't disrupt the song playing
// on the real host screen.
const Host = ({
  remote = false,
}: { remote?: boolean } = {}): React.ReactElement => {
  const router = useRouter();
  const { t, tn } = useT();
  const joinCode = normalizeRoomId(router.query.joinCode) as string | undefined;
  // Entering from the analytics dashboard's "Open as admin" link. We skip
  // session tracking so an operator peeking at a room isn't counted as a
  // participant that joined it.
  const adminPeek = router.query.admin === "1";

  const [queue, setQueue] = React.useState<QueueEntry[]>([]);
  const boards = useBoards(joinCode);
  // Stable across renders — safe to depend on from the poll/init effects.
  const applyBoards = boards.applyRoom;
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  // Definitive "room doesn't exist" — terminal, stops polling.
  const [error, setError] = React.useState<string | null>(null);
  // Transient load failure (flaky network, 5xx) — retryable; polling keeps
  // running and heals it on the first successful fetch.
  const [loadError, setLoadError] = React.useState(false);
  const [initNonce, setInitNonce] = React.useState(0);
  // Consecutive not-found polls; a TTL-expired room must surface the
  // not-found state instead of a live-looking UI where every button no-ops,
  // but a single blip shouldn't.
  const notFoundPollsRef = React.useRef(0);
  const [origin, setOrigin] = React.useState("");
  const [confirmRemove, setConfirmRemove] = React.useState<string | null>(null);
  const [reactionsOn, setReactionsOn] = React.useState(true);
  const [boardsOnDisplay, setBoardsOnDisplayState] = React.useState(true);
  const [fairMode, setFairModeState] = React.useState(false);
  const [displayConfig, setDisplayConfigState] = React.useState<DisplayConfig>(DEFAULT_DISPLAY_CONFIG);
  const [hostConfig, setHostConfigState] = React.useState<HostConfig>(DEFAULT_HOST_CONFIG);
  const [reactionCooldown, setReactionCooldown] = React.useState(false);
  const [lastSentEmoji, setLastSentEmoji] = React.useState<string | null>(null);
  const [visibleReactions, setVisibleReactions] = React.useState<
    (Reaction & { key: string; left: number; sway: number })[]
  >([]);
  const seenReactionIds = React.useRef(new Set<string>());
  const reactionTimers = React.useRef<ReturnType<typeof setTimeout>[]>([]);
  const videoRef = React.useRef<HTMLIFrameElement>(null);

  // Where the video plays. `null` until the host has chosen (or we've
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

  // Which device owns the current playback (here-mode only). We render the
  // video iff the room's playToken is one we minted; other host devices show a
  // status panel instead of double-playing the song.
  const [ownedPlayToken, setOwnedPlayToken] = React.useState<string | null>(null);
  const [serverPlayToken, setServerPlayToken] = React.useState<string | null>(null);
  // Someone paused the video on the display screen (reported by the display).
  const [displayPaused, setDisplayPaused] = React.useState(false);
  // A display page has heartbeated recently (server-computed on each GET).
  const [displayConnected, setDisplayConnected] = React.useState(false);
  // Auto-fallback bookkeeping (see the effects below). displayWindowRef holds
  // the window.open handle for a display this host opened — the fast, reliable
  // close signal. displaySeenLiveRef gates the slower server-heartbeat path so
  // the startup gap before the first heartbeat can't trip it; displayGoneTimer
  // is that path's confirm delay, which absorbs a cross-device display reload.
  const displayWindowRef = React.useRef<Window | null>(null);
  // Bumped whenever we open a display window, so the handle watcher re-arms even
  // when we were already in TV mode (e.g. a restored session hits "reopen").
  const [displayWindowNonce, setDisplayWindowNonce] = React.useState(0);
  const displaySeenLiveRef = React.useRef(false);
  const displayGoneTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPlayingRef = React.useRef(false);
  React.useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  const playsVideoHere =
    isPlaying && !!serverPlayToken && serverPlayToken === ownedPlayToken;

  // Here-mode only: whether the host's own YouTube player is currently playing,
  // so the transport can show a real Pause/Play control (parity with TV mode)
  // instead of leaving the host to hunt for YouTube's own chrome. Starts
  // optimistically true (the room says it's playing); the watchdog below flips
  // it to false if autoplay was actually blocked. herePlayingRef mirrors it for
  // the watchdog and the postMessage listener.
  const [hereVideoPlaying, setHereVideoPlaying] = React.useState(true);
  const herePlayingRef = React.useRef(false);

  React.useEffect(() => {
    if (!joinCode || remote) return;
    setOwnedPlayToken(readStoredPlayToken(joinCode));
  }, [joinCode, remote]);

  // Mirror this tab's play token out as the tab goes away (close, navigate,
  // reload) so a genuine restore can reclaim it — see storage.ts for why the
  // live token is per-tab.
  React.useEffect(() => {
    if (!joinCode || remote) return;
    const onPageHide = () => mirrorPlayTokenForRestore(joinCode);
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [joinCode, remote]);

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
  // The cheer bar can be tucked away too — same reasoning as the QR drawer:
  // when this screen is cast, the host may not want tappable emoji on the
  // shared display. Defaults open; remembered per-room.
  const [cheersOpen, setCheersOpen] = React.useState(true);
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

  React.useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Restore where this device last played video for this room, so a refresh
  // keeps the host's setup instead of re-asking. Runs the moment we know the
  // room code — independent of room loading — so the chooser never flashes.
  // The room's server-stored playMode (applied once the room loads) wins over
  // this: it's what lets a brand-new host device pick up an existing TV setup.
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

  // Restore whether this host had the cheer bar tucked away for this room.
  React.useEffect(() => {
    if (!joinCode) return;
    try {
      setCheersOpen(localStorage.getItem(cheersHiddenStorageKey(joinCode)) !== "1");
    } catch {
      setCheersOpen(true);
    }
  }, [joinCode]);

  function toggleCheers() {
    const next = !cheersOpen;
    setCheersOpen(next);
    if (joinCode) {
      try {
        localStorage.setItem(cheersHiddenStorageKey(joinCode), next ? "0" : "1");
      } catch {}
    }
  }

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

  // Persist the mode on the room (so every host device agrees) and in
  // localStorage (fallback for rooms that predate server-stored modes).
  function rememberMode(mode: PlayMode) {
    if (!joinCode) return;
    try {
      localStorage.setItem(playModeStorageKey(joinCode), mode);
    } catch {}
    // Hold polling briefly so an in-flight poll with the old mode can't
    // flip the pill back before the server write lands.
    pausePolling();
    savePlayMode(joinCode, mode).then((ok) => {
      if (!ok) resyncAfterFailedWrite();
    });
  }

  // Choose "this screen" — the simplest setup, nothing else to open.
  function playHere() {
    setPlayMode("here");
    rememberMode("here");
    setModeMenuOpen(false);
  }

  // Choose "separate TV" — open (or re-open) the display window to cast. Keep
  // the window handle: its `.closed` is the fast, reliable signal that the host
  // watches to fall back to this screen the instant the display is closed.
  function openTvDisplay() {
    displayWindowRef.current = window.open(`/display/${joinCode}`, "_blank");
    fallbackFiredRef.current = false;
    setDisplayWindowNonce((n) => n + 1);
    setPlayMode("tv");
    rememberMode("tv");
    setModeMenuOpen(false);
    showToast(t('host.toast.displayOpened'));
  }

  async function copyCohostLink() {
    if (!joinCode) return;
    const base = origin || window.location.origin;
    const url = `${base}/remote/${joinCode}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast(t('host.toast.cohostCopied'));
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

  // On the initial load we only seed the seen-set (animate=false) — otherwise
  // a refresh replays the last 30s of cheers all at once.
  function processReactions(reactions: Reaction[] | undefined, animate = true) {
    if (!reactions || reactions.length === 0) return;
    const fresh = reactions.filter((r) => !seenReactionIds.current.has(r.id));
    if (fresh.length === 0) return;
    fresh.forEach((r) => seenReactionIds.current.add(r.id));
    if (seenReactionIds.current.size > 200) {
      const entries = Array.from(seenReactionIds.current);
      seenReactionIds.current = new Set(entries.slice(-100));
    }
    if (!animate) return;
    const withKeys = fresh.map((r) => ({
      ...r,
      key: r.id,
      left: 5 + Math.random() * 85,
      sway: Math.random() * 70 - 35,
    }));
    setVisibleReactions((prev) => [...prev, ...withKeys]);
    const timer = setTimeout(() => {
      const ids = new Set(fresh.map((r) => r.id));
      setVisibleReactions((prev) => prev.filter((r) => !ids.has(r.key)));
    }, 4400);
    reactionTimers.current.push(timer);
  }

  // Apply a fresh server snapshot to local state. Non-remote hosts also adopt
  // the room's playMode so a host device that joins (or rejoins) an existing
  // TV-mode room acts as a remote instead of defaulting to playing locally.
  function applyRoomState(room: Room) {
    setQueue(room.queue);
    applyBoards(room);
    setActiveIndex(room.activeVideoIndex);
    setIsPlaying(room.isPlaying ?? false);
    setServerPlayToken(room.playToken ?? null);
    setDisplayPaused(room.displayPaused ?? false);
    setDisplayConnected(room.displayConnected ?? false);
    setReactionsOn(room.reactionsEnabled ?? true);
    setBoardsOnDisplayState(room.boardsOnDisplay ?? true);
    setFairModeState(room.fairMode ?? false);
    setDisplayConfigState(normalizeDisplayConfig(room.displayConfig));
    setHostConfigState(normalizeHostConfig(room.hostConfig));
    if (!remote && room.playMode) setPlayMode(room.playMode);
  }

  // Customize mode: the host page keeps running exactly as-is while the REAL
  // control-surface elements grow drag handles and render from a staged draft.
  // Nothing reaches the room until Save. Co-hosts see the shared layout but
  // never enter edit (the Customize button is host-only).
  const hostEdit = useHostEdit({
    joinCode,
    config: hostConfig,
    onSaved: setHostConfigState,
  });
  const hostView = hostEdit.view;

  React.useEffect(() => {
    if (!joinCode) return;

    let cancelled = false;

    async function init() {
      // A co-host only reads the room — never create it. Sending our stored
      // play token lets the server reset play state only when WE were the
      // playback surface and just reloaded (the song died with the page).
      if (!remote) await createRoom(joinCode!, readStoredPlayToken(joinCode!));
      const room = await getRoom(joinCode!);
      if (cancelled) return;
      if (room === "notFound") {
        setError(t('host.error.notFound'));
      } else if (room === "error") {
        // Flaky connection — retryable state, never "room not found" (and
        // never an eternal spinner).
        setLoadError(true);
      } else {
        // Mark this as the device's current room so the landing page offers
        // "resume" instead of a duplicate. Co-hosts don't own the room.
        if (!remote) rememberLastHostedRoom(joinCode!);
        applyRoomState(room);
        processReactions(room.reactions, false);
        setLoadError(false);
      }
      setLoading(false);
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [joinCode, remote, initNonce]);

  React.useEffect(() => {
    if (!joinCode || adminPeek) return;
    return startSessionTracking(joinCode, hostName || "Host", "host");
  }, [joinCode, hostName, adminPeek]);

  // Poll for queue updates (pauses during drag operations)
  React.useEffect(() => {
    if (!joinCode || error || isPaused) return;

    return startVisiblePolling(async () => {
      const room = await getRoom(joinCode);
      if (isPausedRef.current) return;
      if (room === "error") return; // transient — try again next tick
      if (room === "notFound") {
        // Only a run of definitive 404s means the room is really gone
        // (TTL-expired); surface it instead of a UI where every write no-ops.
        notFoundPollsRef.current += 1;
        if (notFoundPollsRef.current >= 3) setError(t('host.error.notFound'));
        return;
      }
      notFoundPollsRef.current = 0;
      applyRoomState(room);
      processReactions(room.reactions);
      // A successful poll also recovers a failed initial load.
      setLoadError(false);
      setLoading(false);
    }, POLL_INTERVAL);
  }, [joinCode, error, isPaused]);

  // Auto-fallback to "this screen" when a cast display disappears. Casting
  // to a dead TV strands the host on a "playing on another screen" panel for a
  // song that isn't playing anywhere; switching the room back to here-mode keeps
  // it usable. Co-hosts (remote) never own the mode, so they sit this out.
  function cancelDisplayFallback() {
    if (displayGoneTimer.current) {
      clearTimeout(displayGoneTimer.current);
      displayGoneTimer.current = null;
    }
  }

  // The actual switch back, shared by both detection paths. Guarded to fire
  // exactly once per TV session so overlapping signals (handle close + stale
  // heartbeat) can't double-switch or double-toast.
  const fallbackFiredRef = React.useRef(false);
  function runDisplayFallback() {
    if (fallbackFiredRef.current) return;
    fallbackFiredRef.current = true;
    cancelDisplayFallback();
    displayWindowRef.current = null;
    displaySeenLiveRef.current = false;
    // Flip everything in one synchronous batch so the panel transitions
    // straight from "playing on the TV" to "ready to play here" — no flash
    // through a stale "playing on another device" frame while an async stop
    // resolves. We clear the local playing flag up front, then persist it.
    if (isPlayingRef.current) {
      setIsPlaying(false);
      setServerPlayToken(null);
      stopSong();
    }
    setPlayMode("here");
    rememberMode("here");
    showToast(t("host.toast.displayClosedFallback"));
  }

  // Fast path: watch the window.open handle for a display this host opened.
  // `.closed` flips true the instant the window/tab is closed and — unlike an
  // unload-time signal — stays false across a reload, so we react immediately
  // with no confirm delay and no network round-trip. This covers the common
  // laptop→TV case; a display opened by URL on another device leaves no handle
  // and relies on the server-heartbeat path below.
  React.useEffect(() => {
    if (remote || !tvMode || !playModeRestored) return;
    if (!displayWindowRef.current) return;
    const check = () => {
      if (displayWindowRef.current && displayWindowRef.current.closed) {
        runDisplayFallback();
      }
    };
    const interval = setInterval(check, 400);
    // React instantly when the host tab regains focus — the user just closed
    // the display and switched back — instead of waiting for the next tick.
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [remote, tvMode, playModeRestored, displayWindowNonce]);

  // Backstop: the server heartbeat going stale (covers a cross-device display,
  // or one whose handle we lost to a host reload). A couple of poll cycles of
  // confirm ride out a display reload before we give up on it.
  React.useEffect(() => {
    if (remote || !tvMode || !playModeRestored) {
      displaySeenLiveRef.current = false;
      cancelDisplayFallback();
      return;
    }
    if (displayConnected) {
      displaySeenLiveRef.current = true;
      fallbackFiredRef.current = false; // a live display — arm the fallback again
      cancelDisplayFallback();
      return;
    }
    // Ignore the startup gap before the first heartbeat, and never stack timers.
    if (!displaySeenLiveRef.current || displayGoneTimer.current) return;
    displayGoneTimer.current = setTimeout(() => {
      displayGoneTimer.current = null;
      runDisplayFallback();
    }, DISPLAY_GONE_CONFIRM_MS);
  }, [remote, tvMode, playModeRestored, displayConnected]);

  function pausePolling() {
    setIsPaused(true);
    isPausedRef.current = true;
    if (pauseTimeout.current) clearTimeout(pauseTimeout.current);
    pauseTimeout.current = setTimeout(() => {
      setIsPaused(false);
      isPausedRef.current = false;
    }, 5000);
  }

  // A failed write must not fail silently: the optimistic UI would quietly
  // revert on a later poll (~5-8s), which reads as "the button did nothing".
  // Toast it and resync to the server's truth right away.
  async function resyncAfterFailedWrite() {
    showToast(t("host.toast.saveFailed"));
    if (!joinCode) return;
    const room = await getRoom(joinCode);
    if (typeof room !== "string") applyRoomState(room);
  }

  function broadcast(q: QueueEntry[], idx: number, playing: boolean) {
    if (!joinCode) return;
    broadcastRoomState(joinCode, {
      queue: q,
      activeVideoIndex: idx,
      isPlaying: playing,
      reactionsEnabled: reactionsOn,
      displayConfig,
    });
  }

  // Once-guard for the here-mode ended handler (mirrors the display's
  // endedHandledRef): YouTube can deliver a straggler infoDelivery state-0
  // after the advance commits, which would advance twice and skip a singer's
  // song. Reset whenever a new song (or a replay) starts.
  const endedHandledRef = React.useRef(false);
  const currentQueueSongId = queue[activeIndex]?.id;
  React.useEffect(() => {
    endedHandledRef.current = false;
  }, [currentQueueSongId, isPlaying]);

  // Use a ref so the postMessage handler always has current state
  const onVideoEndedRef = React.useRef<() => void>(() => {});
  onVideoEndedRef.current = async () => {
    if (!joinCode || endedHandledRef.current) return;
    endedHandledRef.current = true;
    const nextIdx = activeIndex + 1;
    if (nextIdx < queue.length) {
      const ok = await updatePosition(joinCode, nextIdx);
      if (ok) {
        setActiveIndex(nextIdx);
        setIsPlaying(false);
        broadcast(queue, nextIdx, false);
      } else {
        // Advance didn't land — allow the next end event to retry.
        endedHandledRef.current = false;
      }
    } else {
      const ok = await setPlaying(joinCode, false);
      if (ok) {
        setIsPlaying(false);
        broadcast(queue, activeIndex, false);
      } else {
        endedHandledRef.current = false;
      }
    }
  };

  // All-in-one mode: listen for YouTube postMessage when the video ends.
  // Only the device actually playing the video (playsVideoHere) listens —
  // other host pages have no player and must not advance the queue.
  React.useEffect(() => {
    if (remote || !playsVideoHere || tvMode) return;

    function onMessage(e: MessageEvent) {
      if (e.origin !== "https://www.youtube.com") return;
      try {
        const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        const state =
          data.event === "onStateChange"
            ? data.info
            : data.event === "infoDelivery"
              ? data.info?.playerState
              : undefined;
        if (state === 0) {
          onVideoEndedRef.current();
        } else if (state === 1 || state === 3) {
          // Playing or buffering.
          herePlayingRef.current = true;
          setHereVideoPlaying(true);
        } else if (state === 2) {
          // Paused (via YouTube's own controls or our button).
          setHereVideoPlaying(false);
        }
      } catch {}
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [playsVideoHere, tvMode, remote]);

  // Here-mode autoplay watchdog: assume playing (the room says so), but if
  // YouTube never confirms shortly after the player (re)mounts, autoplay was
  // blocked — flip the control to Play so the host can start it with one tap.
  React.useEffect(() => {
    if (remote || tvMode || !playsVideoHere) return;
    herePlayingRef.current = false;
    setHereVideoPlaying(true);
    const timer = setTimeout(() => {
      if (!herePlayingRef.current) setHereVideoPlaying(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, [playsVideoHere, tvMode, remote, activeIndex]);

  // Pause/resume the host's own player. A click is the user gesture that lets a
  // blocked player start with sound (same trick the display uses on tap).
  function toggleHereVideo() {
    const playing = hereVideoPlaying;
    videoRef.current?.contentWindow?.postMessage(
      JSON.stringify({
        event: "command",
        func: playing ? "pauseVideo" : "playVideo",
        args: [],
      }),
      "https://www.youtube.com",
    );
    setHereVideoPlaying(!playing);
  }

  // All-in-one mode: subscribe to YouTube events when iframe loads
  function handleIframeLoad() {
    videoRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "listening", id: "karaoq" }),
      "https://www.youtube.com",
    );
  }

  // TV mode: the display advances the room server-side when a video ends,
  // then pings same-browser host tabs over BroadcastChannel. Refetch instead
  // of advancing again — advancing here too would double-skip. Cross-device
  // hosts don't get the ping and pick the change up on the next poll.
  React.useEffect(() => {
    if (remote || !joinCode || !tvMode) return;
    return onVideoEnded(joinCode, async () => {
      const room = await getRoom(joinCode);
      if (typeof room !== "string" && !isPausedRef.current) {
        applyRoomState(room);
        processReactions(room.reactions);
      }
    });
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
        displayConfig,
      });
      showToast(next ? t('host.toast.reactionsOn') : t('host.toast.reactionsOff'));
    }
  }

  // Write-first like toggleReactions — but either direction re-sorts the
  // upcoming queue server-side (on = round-robin, off = back to queue time),
  // so always refetch and adopt the server's order rather than re-sorting
  // locally, then broadcast the fresh state to displays.
  async function toggleFairMode() {
    if (!joinCode) return;
    const next = !fairMode;
    pausePolling();
    const ok = await setFairMode(joinCode, next);
    if (!ok) {
      await resyncAfterFailedWrite();
      return;
    }
    setFairModeState(next);
    showToast(next ? t('host.toast.fairOn') : t('host.toast.fairOff'));
    const room = await getRoom(joinCode);
    if (typeof room !== "string") {
      applyRoomState(room);
      broadcast(room.queue, room.activeVideoIndex, room.isPlaying ?? false);
    }
  }

  function handleSongAdded(entry: QueueEntry) {
    pausePolling();
    // Mirror where the server just put it. In fair mode the song lands at the
    // singer's round-robin slot, so appending here would show the host a
    // bottom-of-queue song that silently jumps once polling resumes.
    let newQueue: QueueEntry[];
    if (fairMode) {
      const upcoming = queue.slice(activeIndex);
      const at = fairInsertIndex(upcoming, entry.userName);
      newQueue = [
        ...queue.slice(0, activeIndex),
        ...upcoming.slice(0, at),
        entry,
        ...upcoming.slice(at),
      ];
    } else {
      newQueue = [...queue, entry];
    }
    setQueue(newQueue);
    broadcast(newQueue, activeIndex, isPlaying);
    showToast(t('host.toast.added', { title: formatSongTitle(entry.songTitle) }));
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
    // Mint a fresh playback token: this device becomes the playback surface.
    // If another host device was playing, it sees the foreign token on its
    // next poll and yields — starting here doubles as a clean takeover.
    const token = uuidv4();
    const ok = await setPlaying(joinCode, true, token);
    if (ok) {
      setOwnedPlayToken(token);
      setServerPlayToken(token);
      storePlayToken(joinCode, token);
      setIsPlaying(true);
      broadcast(queue, activeIndex, true);
    }
  }

  async function stopSong() {
    if (!joinCode) return;
    const ok = await setPlaying(joinCode, false);
    if (ok) {
      setServerPlayToken(null);
      setIsPlaying(false);
      broadcast(queue, activeIndex, false);
    }
  }

  // TV mode: pause or resume the video playing on the display, from here.
  // Flips the room's shared pause flag; the display watches it and drives its
  // own player, then reports the real state back — which also keeps a pause
  // made on the display screen itself reflected on this button.
  async function toggleDisplayPause() {
    if (!joinCode) return;
    const next = !displayPaused;
    // Hold polling briefly so an in-flight poll with the old value can't flip
    // the button back before the write lands (same trick as rememberMode).
    pausePolling();
    setDisplayPaused(next);
    // Nudge a same-browser display right away so it reacts instantly; the POST
    // persists it and reaches cross-device displays on their next poll.
    broadcastDisplayPause(joinCode, next);
    const ok = await saveDisplayPaused(joinCode, next);
    if (!ok) {
      setDisplayPaused(!next);
      broadcastDisplayPause(joinCode, !next);
      await resyncAfterFailedWrite();
    }
  }

  async function handleReorder(
    newUpcoming: QueueEntry[],
    start = activeIndex + 1,
  ): Promise<boolean> {
    if (!joinCode) return false;
    pausePolling();
    const history = queue.slice(0, start);
    const newQueue = [...history, ...newUpcoming];
    setQueue(newQueue);
    const ok = await reorderQueue(joinCode, newQueue, activeIndex);
    if (!ok) {
      await resyncAfterFailedWrite();
      return false;
    }
    broadcast(newQueue, activeIndex, isPlaying);
    return true;
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
      const ok = await reorderQueue(joinCode, newQueue, activeIndex);
      if (!ok) {
        await resyncAfterFailedWrite();
        return;
      }
      broadcast(newQueue, activeIndex, isPlaying);
    } else {
      const upcoming = queue.slice(activeIndex + 1);
      const idx = upcoming.findIndex((e) => e.id === entryId);
      if (idx <= 0) return;
      const moved = arrayMove(upcoming, idx, 0);
      if (!(await handleReorder(moved))) return;
    }
    showToast(t('host.toast.movedTop'));
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
    const ok = await reorderQueue(joinCode, newQueue, newActiveIndex);
    if (!ok) {
      await resyncAfterFailedWrite();
      return;
    }
    broadcast(newQueue, newActiveIndex, isPlaying);
    showToast(t('host.toast.restored', { title: formatSongTitle(entry.songTitle) }));
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
    const ok = await removeFromQueue(joinCode, entryId);
    if (!ok) {
      await resyncAfterFailedWrite();
      return;
    }
    if (entry) showToast(t('host.toast.removed', { title: formatSongTitle(entry.songTitle) }));
  }

  async function editSave(id: string, newName: string) {
    setEditingId(null);
    if (!joinCode) return;
    // Persist the rename (positional $set server-side) — local-only state
    // would be reverted by the next poll and never reach other devices.
    // Hold polling so an in-flight poll with the old name can't flash back.
    pausePolling();
    const newQueue = queue.map((e) =>
      e.id === id ? { ...e, userName: newName } : e,
    );
    setQueue(newQueue);
    broadcast(newQueue, activeIndex, isPlaying);
    const ok = await renameQueueEntry(joinCode, id, newName);
    if (!ok) await resyncAfterFailedWrite();
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

  // On phones an empty room hides the transport bar and sidebar entirely —
  // the empty-state pitch already carries the add button and join QR, so the
  // extra chrome is all duplicates (second add button, second QR, controls
  // with nothing to control). Desktop keeps everything.
  const roomEmpty = queue.length === 0;

  const uniqueSingers = new Set(upNext.map((s) => s.userName)).size;

  // Everything below renders from hostView: the staged draft while customizing,
  // the room's config otherwise. A hidden History tab can't be the active tab.
  const effectiveSidebarTab = hostView.showHistory ? sidebarTab : "queue";
  const customizing = !remote && hostEdit.editing;

  // The transport bar, reused by both the plain and the Customize-wrapped render.
  const transportBar = (
    <TransportBar
      roomEmpty={roomEmpty}
      currentSong={currentSong}
      isPlaying={isPlaying}
      tvMode={tvMode}
      displayConnected={displayConnected}
      displayPaused={displayPaused}
      playsVideoHere={playsVideoHere}
      hereVideoPlaying={hereVideoPlaying}
      activeIndex={activeIndex}
      queueLength={queue.length}
      onPrevious={playPrevious}
      onToggleDisplayPause={toggleDisplayPause}
      onStop={stopSong}
      onToggleHereVideo={toggleHereVideo}
      onStart={startSong}
      onNext={playNext}
    />
  );

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

  if (!joinCode) return <div className={styles.loading}>{t('host.loading')}</div>;

  if (error) {
    return (
      <main className={styles.main}>
        <div className={styles.errorCard}>
          <h2>{t('host.error.title')}</h2>
          <p>{error}</p>
          <button className={styles.btn} onClick={() => router.push("/")}>
            {t('common.goHome')}
          </button>
        </div>
      </main>
    );
  }

  // Transient failure: retry button plus the still-running poll, so it heals
  // by itself the moment the connection comes back.
  if (loadError) {
    return (
      <main className={styles.main}>
        <div className={styles.errorCard}>
          <h2>{t('common.connectionErrorTitle')}</h2>
          <p>{t('common.connectionErrorBody')}</p>
          <button
            className={styles.btn}
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

  return (
    <main
      className={`${styles.main} ${HOST_THEME_CLASS[hostView.theme]} ${customizing ? styles.mainCustomizing : ""}`}
      style={{ "--host-sb-w": `${hostView.sidebarWidth}px` } as React.CSSProperties}
      onClick={customizing ? () => hostEdit.setSelected(null) : undefined}
    >
      <HostHeader
        remote={remote}
        tvMode={tvMode}
        customizing={customizing}
        canCustomize={!remote && !loading}
        onCustomize={() => {
          setSettingsOpen(false);
          setModeMenuOpen(false);
          hostEdit.enter();
        }}
        modeMenuOpen={modeMenuOpen}
        onModePillClick={() => {
          setModeMenuOpen((o) => !o);
          setSettingsOpen(false);
        }}
        onModeMenuBackdropClick={() => setModeMenuOpen(false)}
        onPlayHere={playHere}
        onOpenTvDisplay={openTvDisplay}
        settingsOpen={settingsOpen}
        onGearClick={() => {
          setSettingsOpen(!settingsOpen);
          setModeMenuOpen(false);
        }}
        onSettingsClose={() => setSettingsOpen(false)}
        reactionsOn={reactionsOn}
        onToggleReactions={toggleReactions}
        fairMode={fairMode}
        onToggleFairMode={toggleFairMode}
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
        onBrandClick={() => router.push("/")}
      />

      <div
        className={`${styles.content} ${hostView.sidebarPosition === "left" ? styles.contentSidebarLeft : ""}`}
      >
        <div className={tvMode ? styles.controlPanel : styles.playerArea}>
          <SongStage
            loading={loading}
            currentSong={currentSong}
            remote={remote}
            tvMode={tvMode}
            isPlaying={isPlaying}
            displayPaused={displayPaused}
            displayConnected={displayConnected}
            playsVideoHere={playsVideoHere}
            videoRef={videoRef}
            onIframeLoad={handleIframeLoad}
            onOpenTvDisplay={openTvDisplay}
            onStartSong={startSong}
            joinUrl={joinUrl}
            displayUrl={displayUrl}
            joinCode={joinCode}
            onPrintQr={printQr}
            onAddFirst={() => setSearchOpen(true)}
          />

          {/* Reaction overlay — inside the player area so cheers float over
              the current song, never the queue or panels */}
          {!remote && reactionsOn && visibleReactions.length > 0 && (
            <ReactionOverlay reactions={visibleReactions} />
          )}

          {/* Transport bar — host only; co-hosts don't control playback. Never
              hideable: without it the host can't run the room. */}
          {!remote && transportBar}
        </div>

        <QueueSidebar
          remote={remote}
          roomEmpty={roomEmpty}
          sidebarCollapsed={sidebarCollapsed}
          onExpandSidebar={() => setSidebarCollapsed(false)}
          onCollapseSidebar={() => setSidebarCollapsed(true)}
          sidebarTab={effectiveSidebarTab}
          onSelectTab={setSidebarTab}
          searchOpen={searchOpen}
          onToggleSearch={() => setSearchOpen(!searchOpen)}
          onCloseSearch={() => setSearchOpen(false)}
          onOpenBoards={() => setSearchOpen(true)}
          upNext={upNext}
          historyItems={historyItems}
          uniqueSingers={uniqueSingers}
          fairMode={fairMode}
          onToggleFairMode={toggleFairMode}
          editingId={editingId}
          onDragStart={pausePolling}
          onDragEnd={handleDragEnd}
          onMoveTop={moveToTop}
          onToggleEdit={(id) => setEditingId(editingId === id ? null : id)}
          onEditSave={editSave}
          onRequestRemove={setConfirmRemove}
          onReplayFromHistory={replayFromHistory}
          reactionsOn={reactionsOn}
          isPlaying={isPlaying}
          currentSong={currentSong}
          cheersOpen={cheersOpen}
          onToggleCheers={toggleCheers}
          onSendReaction={sendReaction}
          reactionCooldown={reactionCooldown}
          lastSentEmoji={lastSentEmoji}
          joinCode={joinCode}
          boards={boards}
          hostName={hostName}
          joinUrl={joinUrl}
          displayUrl={displayUrl}
          qrShelfOpen={qrShelfOpen}
          onToggleQrShelf={toggleQrShelf}
          onOpenQrModal={() => setQrModalOpen(true)}
          onSongAdded={handleSongAdded}
          showHistory={hostView.showHistory}
          hostConfig={hostView}
          hostEdit={
            customizing
              ? {
                  selected: hostEdit.selected,
                  onSelect: hostEdit.setSelected,
                  onChange: hostEdit.change,
                }
              : undefined
          }
          hostEditing={customizing}
          sideDragProps={hostEdit.sideDragProps}
          widthDragProps={hostEdit.widthDragProps}
          sideDragging={hostEdit.sideDragTarget !== null}
        />
      </div>

      {/* Customize-mode chrome: theme/toggle rail on the free edge, floating
          save bar, and side drop-zones while the sidebar is dragged across. */}
      {customizing && (
        <EditOverlay
          rail={
            <HostEditRail
              config={hostView}
              side={hostView.sidebarPosition === "right" ? "left" : "right"}
              selected={hostEdit.selected}
              onSelect={hostEdit.setSelected}
              onChange={hostEdit.change}
            />
          }
          dirty={hostEdit.dirty}
          saving={hostEdit.saving}
          saveFailed={hostEdit.saveFailed}
          onDiscard={hostEdit.discard}
          onSave={hostEdit.save}
          sideDragTarget={hostEdit.sideDragTarget}
        />
      )}

      {!remote && !customizing && <MobileFooter />}

      {cohostOpen && (
        <CohostInviteModal
          cohostUrl={cohostUrl}
          cohostDisplayUrl={cohostDisplayUrl}
          onClose={() => setCohostOpen(false)}
          onCopyLink={copyCohostLink}
        />
      )}

      {qrModalOpen && joinUrl && (
        <QrModal
          joinUrl={joinUrl}
          displayUrl={displayUrl}
          joinCode={joinCode}
          onClose={() => setQrModalOpen(false)}
        />
      )}

      {confirmRemove && (
        <ConfirmRemoveModal
          entryId={confirmRemove}
          queue={queue}
          onCancel={() => setConfirmRemove(null)}
          onConfirm={removeSong}
        />
      )}

      {toast && (
        <div className={styles.toast} key={toast}>
          {toast}
        </div>
      )}

      {showWelcome && !loading && !error && (
        <WelcomePrompt
          joinCode={joinCode}
          welcomeName={welcomeName}
          onChangeName={setWelcomeName}
          onSubmit={handleWelcomeSubmit}
        />
      )}
    </main>
  );
};

export default Host;
