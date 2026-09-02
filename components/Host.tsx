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
import setSessionEnd from "../app/queue/setSessionEnd";
import { formatClockTime } from "../lib/queueTime";
import { useRoomTiming } from "./hooks/useRoomTiming";
import { fairInsertIndex, singerKeys } from "../lib/fairQueue";
import postReaction from "../app/queue/postReaction";
import { REACTION_COOLDOWN_MS } from "../app/queue/cheerConstants";
import { startSessionTracking } from "../app/queue/trackSession";
import { startVisiblePolling } from "../app/queue/pollWhileVisible";
import { useSearchBackNotice } from "../app/queue/useSearchBackNotice";
import SearchBackToast from "./search/SearchBackToast";
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
import { formatSongTitle, shouldClaimPlayback } from "./host/utils";
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
import FeedbackModal from "./feedback/FeedbackModal";
import { QrModal } from "./host/QrModal";
import { ConfirmRemoveModal } from "./host/ConfirmRemoveModal";
import { WelcomePrompt } from "./host/WelcomePrompt";
import { HostHeader } from "./host/HostHeader";
import { SongStage } from "./host/SongStage";
import { TransportBar } from "./host/TransportBar";
import { QueueSidebar } from "./host/QueueSidebar";
import { useHostEdit } from "./host/edit/useHostEdit";
import { ConfigRail } from "./edit/ConfigRail";
import { hostRailToggles } from "./host/edit/railToggles";
import { EditOverlay } from "./edit/EditOverlay";
import { HideButton, Spot } from "./edit/EditChrome";
import p from "../styles/DisplayDesigner.module.css";

const HOST_THEME_CLASS: Record<DisplayTheme, string> = {
  classic: "",
  minimal: styles.themeMinimal,
  neon: styles.themeNeon,
};

// `remote` = co-host surface: queue management plus previous/next skip — no
// player, and play/pause stays on the host devices.
const Host = ({
  remote = false,
}: { remote?: boolean } = {}): React.ReactElement => {
  const router = useRouter();
  const { t, tn, locale } = useT();
  const joinCode = normalizeRoomId(router.query.joinCode) as string | undefined;
  // Analytics "Open as admin" — skips session tracking so an operator isn't counted.
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
  // Transient load failure — retryable; polling keeps running and heals it.
  const [loadError, setLoadError] = React.useState(false);
  const [initNonce, setInitNonce] = React.useState(0);
  // Consecutive not-found polls — a single blip must not surface not-found.
  const notFoundPollsRef = React.useRef(0);
  const [origin, setOrigin] = React.useState("");
  const [confirmRemove, setConfirmRemove] = React.useState<string | null>(null);
  const [reactionsOn, setReactionsOn] = React.useState(true);
  const [boardsOnDisplay, setBoardsOnDisplayState] = React.useState(true);
  const [fairMode, setFairModeState] = React.useState(false);
  const timing = useRoomTiming({
    queue,
    activeVideoIndex: activeIndex,
    isPlaying,
  });
  const { sessionEndsAt, estimate } = timing;
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

  // null until chosen/restored — that's what triggers the first-run chooser.
  // Co-hosts never see the chooser: they start at "here" and adopt the room's
  // real mode on the first fetch, without ever choosing or persisting one.
  const [playMode, setPlayMode] = React.useState<PlayMode | null>(
    remote ? "here" : null,
  );
  // The chooser waits for the localStorage restore, or a remembered host re-prompts.
  const [playModeRestored, setPlayModeRestored] = React.useState(false);
  const tvMode = playMode === "tv";

  // Here-mode: the video renders iff the room's playToken is one we minted;
  // other host devices show a status panel instead of double-playing.
  const [ownedPlayToken, setOwnedPlayToken] = React.useState<string | null>(null);
  const [serverPlayToken, setServerPlayToken] = React.useState<string | null>(null);
  const [displayPaused, setDisplayPaused] = React.useState(false);
  // A display page has heartbeated recently (server-computed on each GET).
  const [displayConnected, setDisplayConnected] = React.useState(false);
  // Auto-fallback bookkeeping — see the two detection effects below.
  const displayWindowRef = React.useRef<Window | null>(null);
  // Bumped per display open so the handle watcher re-arms even mid-TV-mode.
  const [displayWindowNonce, setDisplayWindowNonce] = React.useState(0);
  const displaySeenLiveRef = React.useRef(false);
  const displayGoneTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPlayingRef = React.useRef(false);
  React.useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  const playsVideoHere =
    isPlaying && !!serverPlayToken && serverPlayToken === ownedPlayToken;

  // Here-mode: starts optimistically true; the autoplay watchdog flips it false
  // if blocked. herePlayingRef mirrors it for the watchdog + postMessage listener.
  const [hereVideoPlaying, setHereVideoPlaying] = React.useState(true);
  const herePlayingRef = React.useRef(false);

  React.useEffect(() => {
    if (!joinCode || remote) return;
    setOwnedPlayToken(readStoredPlayToken(joinCode));
  }, [joinCode, remote]);

  // Mirror the per-tab play token out on pagehide so a genuine restore can
  // reclaim it — see storage.ts for why the live token is per-tab.
  React.useEffect(() => {
    if (!joinCode || remote) return;
    const onPageHide = () => mirrorPlayTokenForRestore(joinCode);
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [joinCode, remote]);

  const [hostName, setHostName] = React.useState("");
  const [showWelcome, setShowWelcome] = React.useState(true);
  const [welcomeName, setWelcomeName] = React.useState("");

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
  const [feedbackOpen, setFeedbackOpen] = React.useState(false);
  // Starts closed to avoid a flash on narrow screens; the restore effect below opens it.
  const [qrShelfOpen, setQrShelfOpen] = React.useState(false);
  const [qrModalOpen, setQrModalOpen] = React.useState(false);
  const [cheersOpen, setCheersOpen] = React.useState(true);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [sidebarTab, setSidebarTab] = React.useState<"queue" | "history">(
    "queue",
  );
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const toastTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pauses polling while the organizer is actively reordering or adding songs.
  const [isPaused, setIsPaused] = React.useState(false);
  const isPausedRef = React.useRef(false);
  const pauseTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Restored before room load so the chooser never flashes; server playMode wins later.
  React.useEffect(() => {
    if (remote) {
      setPlayModeRestored(true);
      return;
    }
    if (!joinCode) return;
    try {
      const saved = localStorage.getItem(playModeStorageKey(joinCode));
      setPlayMode(saved === "tv" ? "tv" : "here");
    } catch {
      setPlayMode("here");
    }
    setPlayModeRestored(true);
  }, [joinCode, remote]);

  React.useEffect(() => {
    if (!joinCode) return;
    try {
      const saved = localStorage.getItem(qrHiddenStorageKey(joinCode));
      setQrShelfOpen(saved === null ? window.innerWidth > 1024 : saved !== "1");
    } catch {
      setQrShelfOpen(window.innerWidth > 1024);
    }
  }, [joinCode]);

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

  // Persisted on the room (every host device agrees) and in localStorage
  // (fallback for rooms predating server-stored modes).
  function rememberMode(mode: PlayMode) {
    if (!joinCode) return;
    try {
      localStorage.setItem(playModeStorageKey(joinCode), mode);
    } catch {}
    // Hold polling so an in-flight poll with the old mode can't flip the pill
    // back before the write lands.
    pausePolling();
    savePlayMode(joinCode, mode).then((ok) => {
      if (!ok) resyncAfterFailedWrite();
    });
  }

  function playHere() {
    setPlayMode("here");
    rememberMode("here");
    setModeMenuOpen(false);
  }

  // Keep the window handle — its `.closed` is the fast fallback signal.
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

  // animate=false on initial load seeds the seen-set only — otherwise a
  // refresh replays the last 30s of cheers all at once.
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

  const searchBack = useSearchBackNotice();

  // Everyone adopts the room's playMode: hosts so rejoining a TV-mode room
  // doesn't play locally, co-hosts so the transport knows when a live display
  // is driving playback.
  function applyRoomState(room: Room) {
    searchBack.applyRoom(room);
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
    timing.adoptRoom(room);
    setDisplayConfigState(normalizeDisplayConfig(room.displayConfig));
    setHostConfigState(normalizeHostConfig(room.hostConfig));
    if (room.playMode) setPlayMode(room.playMode);
  }

  // Customize: the real elements render from a staged draft; nothing reaches
  // the room until Save. Co-hosts never enter edit.
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
      // Co-hosts only read — never create. Sending our stored play token lets the
      // server reset play state only when WE were the playback surface and reloaded.
      if (!remote) await createRoom(joinCode!, readStoredPlayToken(joinCode!));
      const room = await getRoom(joinCode!);
      if (cancelled) return;
      if (room === "notFound") {
        setError(t('host.error.notFound'));
      } else if (room === "error") {
        setLoadError(true);
      } else {
        // Lets the landing page offer "resume"; co-hosts don't own the room.
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

  React.useEffect(() => {
    if (!joinCode || error || isPaused) return;

    return startVisiblePolling(async () => {
      const room = await getRoom(joinCode);
      if (isPausedRef.current) return;
      if (room === "error") return; // transient — try again next tick
      if (room === "notFound") {
        // Only a run of definitive 404s (TTL-expired room) surfaces not-found.
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

  // Auto-fallback to "this screen" when a cast display disappears (hosts only).
  function cancelDisplayFallback() {
    if (displayGoneTimer.current) {
      clearTimeout(displayGoneTimer.current);
      displayGoneTimer.current = null;
    }
  }

  // Fires exactly once per TV session — overlapping signals (handle close +
  // stale heartbeat) must not double-switch or double-toast.
  const fallbackFiredRef = React.useRef(false);
  function runDisplayFallback() {
    if (fallbackFiredRef.current) return;
    fallbackFiredRef.current = true;
    cancelDisplayFallback();
    displayWindowRef.current = null;
    displaySeenLiveRef.current = false;
    // Clear local playing state synchronously before the async stop resolves,
    // so the panel doesn't flash a stale "playing on another device" frame.
    if (isPlayingRef.current) {
      setIsPlaying(false);
      setServerPlayToken(null);
      stopSong();
    }
    setPlayMode("here");
    rememberMode("here");
    showToast(t("host.toast.displayClosedFallback"));
  }

  // Fast path: handle `.closed` flips instantly on close, stays false across a
  // reload; URL-opened displays have no handle and rely on the heartbeat backstop.
  React.useEffect(() => {
    if (remote || !tvMode || !playModeRestored) return;
    if (!displayWindowRef.current) return;
    const check = () => {
      if (displayWindowRef.current && displayWindowRef.current.closed) {
        runDisplayFallback();
      }
    };
    const interval = setInterval(check, 400);
    // Check immediately on refocus instead of waiting for the next tick.
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [remote, tvMode, playModeRestored, displayWindowNonce]);

  // Backstop: stale server heartbeat (cross-device display, or a handle lost to
  // a host reload). The confirm delay rides out a display reload.
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

  // Without this a failed write's optimistic UI would silently revert on a
  // later poll (~5-8s); toast and resync to the server's truth right away.
  async function resyncAfterFailedWrite() {
    showToast(t("host.toast.saveFailed"));
    if (!joinCode) return;
    const room = await getRoom(joinCode);
    if (typeof room !== "string") applyRoomState(room);
  }

  // The play path passes its own fresh stamp: state hasn't caught up in the
  // same tick.
  function broadcast(
    q: QueueEntry[],
    idx: number,
    playing: boolean,
    startedAt: string | null = timing.playStartedAt
  ) {
    if (!joinCode) return;
    broadcastRoomState(joinCode, {
      queue: q,
      activeVideoIndex: idx,
      isPlaying: playing,
      playStartedAt: playing ? startedAt : null,
      reactionsEnabled: reactionsOn,
      displayConfig,
    });
  }

  // Once-guard: YouTube can deliver a straggler state-0 after the advance
  // commits, which would advance twice and skip a singer's song.
  const endedHandledRef = React.useRef(false);
  const currentQueueSongId = queue[activeIndex]?.id;
  React.useEffect(() => {
    endedHandledRef.current = false;
  }, [currentQueueSongId, isPlaying]);

  // Ref so the postMessage handler always has current state.
  const onVideoEndedRef = React.useRef<() => void>(() => {});
  onVideoEndedRef.current = async () => {
    if (!joinCode || endedHandledRef.current) return;
    endedHandledRef.current = true;
    // Past the last song too — bounding this parks on the finished entry, which
    // then replays ahead of anything added afterwards.
    const nextIdx = activeIndex + 1;
    const ok = await updatePosition(joinCode, nextIdx);
    if (ok) {
      setActiveIndex(nextIdx);
      setIsPlaying(false);
      broadcast(queue, nextIdx, false);
    } else {
      // Advance didn't land — allow the next end event to retry.
      endedHandledRef.current = false;
    }
  };

  // Only the device actually playing (playsVideoHere) listens — other host
  // pages have no player and must not advance the queue.
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

  // Autoplay watchdog: if YouTube never confirms shortly after the player
  // (re)mounts, autoplay was blocked — flip the control to Play.
  React.useEffect(() => {
    if (remote || tvMode || !playsVideoHere) return;
    herePlayingRef.current = false;
    setHereVideoPlaying(true);
    const timer = setTimeout(() => {
      if (!herePlayingRef.current) setHereVideoPlaying(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, [playsVideoHere, tvMode, remote, activeIndex]);

  // A co-host's Play flips isPlaying with no surface attached to it. In here-mode
  // this page is the surface, so claim it — otherwise the room reads as playing
  // while the host sits on the "playing on another device" panel and nothing
  // sounds.
  //
  // Visible tabs only: a forgotten background tab grabbing the room would put the
  // night's audio on the wrong screen, and an admin peeking at a live room from
  // Mission Control would steal the venue's playback outright. The claim is a
  // server-side CAS, so of several eligible tabs exactly one wins and the rest
  // yield rather than double-playing the song.
  //
  // Nothing cued up means the co-host's Play was a poll stale (queue edits hold
  // polling) and the song it aimed at has already finished. Claiming it would
  // leave the room reporting isPlaying with silence — and the GET's heal keys on
  // the token being absent, so claiming would disarm the very thing that
  // recovers it.
  const claimingRef = React.useRef(false);
  const [claimNonce, setClaimNonce] = React.useState(0);
  React.useEffect(() => {
    if (!joinCode || claimingRef.current) return;
    // Visibility is re-armed by the nonce below — polling alone can't retry
    // this, since a repeat poll writes identical state and never re-runs.
    const claimable = shouldClaimPlayback({
      remote,
      tvMode,
      adminPeek,
      isPlaying,
      serverPlayToken,
      hasCurrentSong: !!queue[activeIndex],
      visible: document.visibilityState === "visible",
    });
    if (!claimable) return;
    claimingRef.current = true;
    (async () => {
      const token = uuidv4();
      const claimed = await setPlaying(joinCode, true, token, true);
      if (claimed) {
        setOwnedPlayToken(token);
        setServerPlayToken(token);
        storePlayToken(joinCode, token);
        timing.markStarted();
      }
      claimingRef.current = false;
    })();
  }, [
    remote,
    tvMode,
    adminPeek,
    joinCode,
    isPlaying,
    serverPlayToken,
    queue,
    activeIndex,
    claimNonce,
  ]);

  // A tab that mounted hidden over a pending start has already run the effect and
  // bailed; every later poll writes the same state, so only this re-arms it.
  React.useEffect(() => {
    if (remote || tvMode) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") setClaimNonce((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [remote, tvMode]);

  // The click is the user gesture that lets a blocked player start with sound.
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

  function handleIframeLoad() {
    videoRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "listening", id: "karaoq" }),
      "https://www.youtube.com",
    );
  }

  // TV mode: the display already advanced the room server-side — refetch
  // instead of advancing again, which would double-skip.
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

  // Either direction re-sorts the queue server-side, so refetch and adopt the
  // server's order. One flight at a time: a double-tap would send the same stale value twice.
  const fairToggleInFlight = React.useRef(false);
  async function toggleFairMode() {
    if (!joinCode || fairToggleInFlight.current) return;
    fairToggleInFlight.current = true;
    try {
      await doToggleFairMode(joinCode);
    } finally {
      fairToggleInFlight.current = false;
    }
  }
  async function doToggleFairMode(joinCode: string) {
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

  async function updateSessionEnd(endsAt: number | null) {
    if (!joinCode) return;
    // Hold polling so an in-flight poll carrying the old value can't flip it back.
    pausePolling();
    timing.setSessionEndsAt(endsAt);
    const ok = await setSessionEnd(joinCode, endsAt);
    if (!ok) {
      await resyncAfterFailedWrite();
      return;
    }
    showToast(
      endsAt === null
        ? t("host.toast.endTimeCleared")
        : t("host.toast.endTimeSet", { time: formatClockTime(endsAt, locale) })
    );
  }

  function handleSongAdded(entry: QueueEntry) {
    pausePolling();
    // Mirror the server: fair mode lands the song at its round-robin slot.
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
    // Hold polling so a poll fetched just before the write can't snap the
    // index back for a tick.
    pausePolling();
    const ok = await updatePosition(joinCode, nextIndex);
    if (ok) {
      setActiveIndex(nextIndex);
      setIsPlaying(false);
      timing.markStopped();
      broadcast(queue, nextIndex, false);
    }
  }

  async function playPrevious() {
    if (!joinCode) return;
    const prevIndex = activeIndex - 1;
    if (prevIndex < 0) return;
    pausePolling();
    const ok = await updatePosition(joinCode, prevIndex);
    if (ok) {
      setActiveIndex(prevIndex);
      setIsPlaying(false);
      timing.markStopped();
      broadcast(queue, prevIndex, false);
    }
  }

  async function startSong() {
    if (!joinCode) return;
    // Mint a fresh playback token: another host device sees the foreign token
    // on its next poll and yields — starting here doubles as a clean takeover.
    const token = uuidv4();
    const ok = await setPlaying(joinCode, true, token);
    if (ok) {
      setOwnedPlayToken(token);
      setServerPlayToken(token);
      storePlayToken(joinCode, token);
      setIsPlaying(true);
      broadcast(queue, activeIndex, true, timing.markStarted());
    }
  }

  // Co-host play: flip the room to playing without claiming the playback
  // surface — no token is minted. A live display obeys isPlaying directly (its
  // playsVideoHere is mode-based, never token-based); a here-mode host page
  // claims the start and mints the token itself.
  async function startSongRemotely() {
    if (!joinCode) return;
    const ok = await setPlaying(joinCode, true);
    if (ok) {
      setIsPlaying(true);
      broadcast(queue, activeIndex, true, timing.markStarted());
    }
  }

  async function stopSong() {
    if (!joinCode) return;
    const ok = await setPlaying(joinCode, false);
    if (ok) {
      setServerPlayToken(null);
      setIsPlaying(false);
      timing.markStopped();
      broadcast(queue, activeIndex, false);
    }
  }

  // Flips the room's shared pause flag; the display drives its own player and
  // reports the real state back.
  async function toggleDisplayPause() {
    if (!joinCode) return;
    const next = !displayPaused;
    // Hold polling so an in-flight poll with the old value can't flip the button back.
    pausePolling();
    setDisplayPaused(next);
    // Nudge a same-browser display instantly; the POST reaches cross-device
    // displays on their next poll.
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
      // Paused: the on-stage song is part of the list, so move within
      // queue.slice(activeIndex).
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

  async function replayFromHistory(entryId: string) {
    if (!joinCode) return;

    const idx = queue.findIndex((e) => e.id === entryId);
    if (idx === -1 || idx >= activeIndex) return;

    const entry = queue[idx];
    const withoutSong = queue.filter((e) => e.id !== entryId);
    // History removal shifts the active index down one; restore right after it.
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
    // Local-only state would be reverted by the next poll; hold polling so an
    // in-flight poll with the old name can't flash back.
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

    // Match the rendered list: when paused the on-stage song is part of the sidebar.
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
  // The waiting current song stays in the sidebar while paused.
  const includesCurrent = !!(currentSong && !isPlaying);
  const upNext = includesCurrent
    ? queue.slice(activeIndex)
    : queue.slice(activeIndex + 1);
  const historyItems = queue.slice(0, activeIndex);

  const roomEmpty = queue.length === 0;

  // Counted the way the rotation groups people — a duet entry counts each member.
  const uniqueSingers = new Set(upNext.flatMap((s) => singerKeys(s.userName))).size;

  // hostView is the staged draft while customizing, the room's config otherwise.
  const customizing = !remote && hostEdit.editing;

  // Co-host playback gates, decided here so the transport bar and the stage note
  // can't disagree. Play works in both modes: a TV room needs a live display to
  // obey it, a here-mode room needs only a host page, which claims the start on
  // its next poll. Pause stays TV-only — it flips a shared flag that the display
  // reports its real state back against, and the here-mode player reports nothing.
  const cohostCanPlay = remote && (tvMode ? displayConnected : true);
  const cohostControlsLive = remote && tvMode && displayConnected;

  const transportBar = (
    <TransportBar
      roomId={joinCode}
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
      remote={remote}
      cohostControlsLive={cohostControlsLive}
      cohostCanPlay={cohostCanPlay}
      onPrevious={playPrevious}
      onToggleDisplayPause={toggleDisplayPause}
      onStop={stopSong}
      onToggleHereVideo={toggleHereVideo}
      onStart={remote ? startSongRemotely : startSong}
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
      style={
        {
          "--host-sb-w": `${hostView.sidebarWidth}px`,
          "--host-now-h": `${hostView.nowPlayingHeight}px`,
          // CSS can't divide px by px into a plain number, so the type-scale
          // ratio is computed here.
          "--host-now-scale": `${hostView.nowPlayingHeight / DEFAULT_HOST_CONFIG.nowPlayingHeight}`,
        } as React.CSSProperties
      }
      onClick={customizing ? () => hostEdit.setSelected(null) : undefined}
    >
      <SearchBackToast show={searchBack.show} onDismiss={searchBack.dismiss} />
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
        sessionEndsAt={sessionEndsAt}
        onChangeSessionEnd={updateSessionEnd}
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
        onSendFeedback={() => {
          setSettingsOpen(false);
          setFeedbackOpen(true);
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
            songsSung={historyItems.length}
            remote={remote}
            cohostCanPlay={cohostCanPlay}
            cohostControlsLive={cohostControlsLive}
            tvMode={tvMode}
            isPlaying={isPlaying}
            displayPaused={displayPaused}
            displayConnected={displayConnected}
            playsVideoHere={playsVideoHere}
            videoRef={videoRef}
            onIframeLoad={handleIframeLoad}
            onOpenTvDisplay={openTvDisplay}
            onStartSong={startSong}
            joinCode={joinCode}
            onAddFirst={() => setSearchOpen(true)}
          />

          {!remote && reactionsOn && visibleReactions.length > 0 && (
            <ReactionOverlay reactions={visibleReactions} />
          )}

          {/* The display's now-playing bar, plus playback controls. Hide/restore
              mirrors Display.tsx so both surfaces customize it the same way.
              Co-hosts always get the bar (skip-only variant) — showTransport is
              the host's preference for their own screen, and the bar is the
              co-host's only queue-advance control. */}
          {remote ? (
            transportBar
          ) : (
            customizing ? (
              hostView.showTransport ? (
                <Spot
                  id="transport"
                  selected={hostEdit.selected}
                  onSelect={hostEdit.setSelected}
                  label={t('customize.nowPlaying')}
                  className={p.noShrink}
                  chrome={
                    <>
                      <div className={p.chrome}>
                        <HideButton
                          title={t('customize.hide')}
                          onHide={() => hostEdit.change({ showTransport: false })}
                        />
                      </div>
                      <button
                        className={p.heightHandle}
                        title={t('customize.dragHeight')}
                        aria-label={t('customize.dragHeight')}
                        {...hostEdit.heightDragProps}
                      />
                    </>
                  }
                >
                  {transportBar}
                </Spot>
              ) : (
                <button
                  className={`${p.ghost} ${p.ghostSlot}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    hostEdit.change({ showTransport: true });
                    hostEdit.setSelected('transport');
                  }}
                >
                  {t('customize.hiddenTap', { section: t('customize.nowPlaying') })}
                </button>
              )
            ) : (
              hostView.showTransport && transportBar
            ))}
        </div>

        <QueueSidebar
          remote={remote}
          roomEmpty={roomEmpty}
          sidebarCollapsed={sidebarCollapsed}
          onExpandSidebar={() => setSidebarCollapsed(false)}
          onCollapseSidebar={() => setSidebarCollapsed(true)}
          sidebarTab={sidebarTab}
          onSelectTab={setSidebarTab}
          searchOpen={searchOpen}
          onToggleSearch={() => setSearchOpen(!searchOpen)}
          onCloseSearch={() => setSearchOpen(false)}
          onOpenBoards={() => setSearchOpen(true)}
          upNext={upNext}
          historyItems={historyItems}
          uniqueSingers={uniqueSingers}
          estimate={estimate}
          sessionEndsAt={sessionEndsAt}
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

      {customizing && (
        <EditOverlay
          rail={
            <ConfigRail
              side={hostView.sidebarPosition === "right" ? "left" : "right"}
              hintKey="customize.hint.host"
              theme={hostView.theme}
              onPickTheme={(theme) => hostEdit.change({ theme })}
              toggles={hostRailToggles(hostView, hostEdit.change)}
              bannerId="banner"
              bannerLine={hostView.bannerLine}
              onBannerChange={(bannerLine) => hostEdit.change({ bannerLine })}
              selected={hostEdit.selected}
              onSelect={hostEdit.setSelected}
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

      {!remote && !customizing && <MobileFooter roomId={joinCode} />}

      {cohostOpen && (
        <CohostInviteModal
          cohostUrl={cohostUrl}
          cohostDisplayUrl={cohostDisplayUrl}
          onClose={() => setCohostOpen(false)}
          onCopyLink={copyCohostLink}
        />
      )}

      {feedbackOpen && (
        <FeedbackModal
          onClose={() => setFeedbackOpen(false)}
          roomId={joinCode}
          role="host"
        />
      )}

      {qrModalOpen && joinUrl && (
        <QrModal
          joinUrl={joinUrl}
          displayUrl={displayUrl}
          joinCode={joinCode}
          onPrintQr={printQr}
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
