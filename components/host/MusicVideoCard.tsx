import * as React from "react";
import styles from "./MusicVideoCard.module.css";
import { useT } from "../../lib/i18n/I18nProvider";
import { QueueEntry } from "../../pages/api/types";
import { OriginalVideoCandidate } from "../../lib/originalVideo";
import { broadcastOriginalOffset } from "../../app/queue/roomChannel";
import { MusicVideoScrubber, SongPlayback } from "./MusicVideoScrubber";
import { MusicVideoSwapPanel, SwapSource } from "./MusicVideoSwapPanel";

const CARD_WINDOW_MS = 12 * 60 * 1000;
const PENDING_RETRY_MS = 4000;
// Backoff cap: a screen that gave up leaves the card pending until the song
// changes, and that must not keep polling all night.
const PENDING_RETRY_MAX_MS = 30_000;
const OFFSET_MIN = -600;
const OFFSET_MAX = 600;
const OFFSET_DEBOUNCE_MS = 600;

export function musicVideoCardVisible(
  remote: boolean,
  musicVideoAt: string | null | undefined,
  currentSong: QueueEntry | undefined
): boolean {
  if (remote || !currentSong || !musicVideoAt) return false;
  return Date.now() - new Date(musicVideoAt).getTime() < CARD_WINDOW_MS;
}

type OriginalVideoCardStatus = "ok" | "none" | "quota" | "busy" | "pending";

interface OriginalVideoGetResponse {
  status: OriginalVideoCardStatus;
  videoIds: string[];
  picked: string | null;
  candidates: OriginalVideoCandidate[];
}

const PENDING_RESPONSE: OriginalVideoGetResponse = {
  status: "pending",
  videoIds: [],
  picked: null,
  candidates: [],
};

type PickSource = SwapSource | null;

export function MusicVideoCard({
  joinCode,
  activeEntry,
  playback,
}: {
  joinCode: string;
  activeEntry: QueueEntry;
  playback: SongPlayback;
}) {
  const { t } = useT();
  const [loading, setLoading] = React.useState(true);
  const [status, setStatus] = React.useState<OriginalVideoCardStatus>("none");
  const [candidates, setCandidates] = React.useState<OriginalVideoCandidate[]>([]);
  const [picked, setPicked] = React.useState<string | null>(null);
  const [pickSource, setPickSource] = React.useState<PickSource>(null);
  const [expanded, setExpanded] = React.useState(false);
  const [pickedMeta, setPickedMeta] = React.useState<OriginalVideoCandidate | null>(null);
  const [pickFailed, setPickFailed] = React.useState(false);
  const [retryTick, setRetryTick] = React.useState(0);
  const [offsetSeconds, setOffsetSeconds] = React.useState(0);
  const [timingFailed, setTimingFailed] = React.useState(false);

  const entryId = activeEntry.id;
  const pickVersionRef = React.useRef(0);
  const lastSavedOffsetRef = React.useRef(0);
  const offsetDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const offsetSeqRef = React.useRef(0);
  const entryIdRef = React.useRef(entryId);
  entryIdRef.current = entryId;

  React.useEffect(() => {
    const next = activeEntry.originalOffsetSeconds ?? 0;
    offsetSeqRef.current += 1;
    setOffsetSeconds(next);
    lastSavedOffsetRef.current = next;
    setTimingFailed(false);
    if (offsetDebounceRef.current) clearTimeout(offsetDebounceRef.current);
    // entryId only, on purpose: every poll yields a new but equal activeEntry object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId]);

  React.useEffect(() => setPickedMeta(null), [entryId]);

  React.useEffect(() => {
    let cancelled = false;
    const startVersion = pickVersionRef.current;
    setLoading(true);
    setExpanded(false);
    setPickFailed(false);
    fetch(
      `/api/queue/${joinCode}/original-video?entryId=${encodeURIComponent(entryId)}&from=host`,
      { cache: "no-store" }
    )
      // Non-200 is transient, never "no match": right after an advance the server
      // 404s until it catches up, and a screen may still be mid-search.
      .then((r) => (r.ok ? (r.json() as Promise<OriginalVideoGetResponse>) : PENDING_RESPONSE))
      .catch(() => PENDING_RESPONSE)
      .then((body) => {
        if (cancelled || pickVersionRef.current !== startVersion) return;
        setStatus(body.status);
        setCandidates(body.candidates ?? []);
        setPicked(body.picked ?? null);
        setPickSource(null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [joinCode, entryId, retryTick]);

  const pendingRetriesRef = React.useRef(0);
  React.useEffect(() => {
    if (loading) return;
    if (status !== "pending") {
      pendingRetriesRef.current = 0;
      return;
    }
    const delay = Math.min(PENDING_RETRY_MS * 2 ** pendingRetriesRef.current, PENDING_RETRY_MAX_MS);
    const timer = setTimeout(() => {
      pendingRetriesRef.current += 1;
      setRetryTick((n) => n + 1);
    }, delay);
    return () => clearTimeout(timer);
  }, [status, loading, retryTick]);

  function pick(videoId: string | null, source: SwapSource, meta?: OriginalVideoCandidate) {
    setPickedMeta(meta ?? null);
    const prev = {
      picked,
      pickSource,
      status,
      offsetSeconds,
      savedOffset: lastSavedOffsetRef.current,
    };
    pickVersionRef.current += 1;
    offsetSeqRef.current += 1;
    setPicked(videoId);
    setPickSource(source);
    setStatus(videoId === null ? "none" : "ok");
    setLoading(false);
    setPickFailed(false);
    setExpanded(false);
    // The server unsets the timing nudge on any pick — mirror that locally.
    if (offsetDebounceRef.current) clearTimeout(offsetDebounceRef.current);
    setOffsetSeconds(0);
    lastSavedOffsetRef.current = 0;
    broadcastOriginalOffset(joinCode, { entryId, offsetSeconds: 0 });
    fetch(`/api/queue/${joinCode}/original-video`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId, videoId, source }),
    })
      .then((r) => {
        if (!r.ok) throw new Error("pick failed");
      })
      .catch(() => {
        setPicked(prev.picked);
        setPickSource(prev.pickSource);
        setStatus(prev.status);
        setPickFailed(true);
        setOffsetSeconds(prev.offsetSeconds);
        lastSavedOffsetRef.current = prev.savedOffset;
        broadcastOriginalOffset(joinCode, { entryId, offsetSeconds: prev.offsetSeconds });
      });
  }

  function commitOffset(next: number, seq: number, forEntryId: string) {
    const prev = lastSavedOffsetRef.current;
    fetch(`/api/queue/${joinCode}/original-video`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId: forEntryId, offsetSeconds: next }),
    })
      .then((r) => {
        if (!r.ok) throw new Error("offset failed");
        if (offsetSeqRef.current !== seq) return;
        lastSavedOffsetRef.current = next;
      })
      .catch(() => {
        if (offsetSeqRef.current !== seq || entryIdRef.current !== forEntryId) return;
        setOffsetSeconds(prev);
        setTimingFailed(true);
        broadcastOriginalOffset(joinCode, { entryId: forEntryId, offsetSeconds: prev });
      });
  }

  function applyOffset(next: number) {
    offsetSeqRef.current += 1;
    const seq = offsetSeqRef.current;
    setOffsetSeconds(next);
    setTimingFailed(false);
    broadcastOriginalOffset(joinCode, { entryId, offsetSeconds: next });
    if (offsetDebounceRef.current) clearTimeout(offsetDebounceRef.current);
    offsetDebounceRef.current = setTimeout(
      () => commitOffset(next, seq, entryId),
      OFFSET_DEBOUNCE_MS
    );
  }

  function changeOffset(next: number) {
    applyOffset(Math.max(OFFSET_MIN, Math.min(OFFSET_MAX, next)));
  }

  const displayedId = picked ?? candidates[0]?.videoId ?? null;
  const displayedMeta =
    candidates.find((c) => c.videoId === displayedId) ??
    (pickedMeta?.videoId === displayedId ? pickedMeta : undefined);
  const matchedTitle = displayedMeta?.title ?? null;
  const displayedTitle =
    matchedTitle ?? (picked && pickSource === "link" ? t("musicVideo.card.pasted") : displayedId);

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.label}>{t("musicVideo.card.title")}</span>
        <button className={styles.swapBtn} onClick={() => setExpanded((v) => !v)}>
          {t("musicVideo.card.swap")}
        </button>
      </div>

      {loading || status === "pending" ? (
        <div className={styles.skeleton} />
      ) : displayedId ? (
        <div className={styles.current}>
          <span className={styles.title}>{displayedTitle}</span>
        </div>
      ) : (
        <div className={styles.none}>{t("musicVideo.card.none")}</div>
      )}

      {!loading && status !== "pending" && displayedId && (
        <MusicVideoScrubber
          joinCode={joinCode}
          entryId={entryId}
          videoId={displayedId}
          playback={playback}
          durationSeconds={displayedMeta?.durationSeconds}
          offsetSeconds={offsetSeconds}
          onChange={changeOffset}
        />
      )}

      {pickFailed && <div className={styles.badLink}>{t("musicVideo.card.failed")}</div>}
      {timingFailed && <div className={styles.badLink}>{t("musicVideo.card.timingFailed")}</div>}

      {expanded && (
        <MusicVideoSwapPanel
          joinCode={joinCode}
          candidates={candidates}
          currentId={displayedId}
          onPick={pick}
        />
      )}
    </div>
  );
}
