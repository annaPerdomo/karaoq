import * as React from "react";
import styles from "./MusicVideoCard.module.css";
import { useT } from "../../lib/i18n/I18nProvider";
import { QueueEntry } from "../../pages/api/types";
import type { OriginalVideoCandidate } from "../../lib/originalVideo";
import { buildSearchQuery } from "../../lib/searchQuery";
import searchYoutube, { SearchUnavailableError } from "../../app/queue/searchYoutube";
import lookupVideo from "../../app/queue/lookupVideo";
import { SwapSearchOutcome, SwapSource, VideoSwapPanel } from "./VideoSwapPanel";
import { formatSongTitle } from "./utils";

type LinkError = "notEmbeddable" | "linkFailed";

function searchKaraokeVideos(joinCode: string, q: string): Promise<SwapSearchOutcome> {
  return searchYoutube(
    buildSearchQuery(q, true),
    { duration: "any", sortBy: "relevance" },
    undefined,
    joinCode
  )
    .then((results): SwapSearchOutcome =>
      results.length
        ? {
            status: "ok",
            candidates: results.map((r) => ({
              videoId: r.videoId,
              title: r.title,
              ...(r.durationSeconds ? { durationSeconds: r.durationSeconds } : {}),
            })),
          }
        : { status: "none" }
    )
    .catch((e): SwapSearchOutcome => ({
      status: e instanceof SearchUnavailableError && e.reason === "quota" ? "quota" : "failed",
    }));
}

export function KaraokeVideoCard({
  joinCode,
  activeEntry,
  live,
  onSwap,
}: {
  joinCode: string;
  activeEntry: QueueEntry;
  live: boolean;
  onSwap: (entryId: string, video: OriginalVideoCandidate, source: SwapSource) => void;
}) {
  const { t } = useT();
  const [expanded, setExpanded] = React.useState(false);
  const [candidates, setCandidates] = React.useState<OriginalVideoCandidate[]>([]);
  const [checkingLink, setCheckingLink] = React.useState(false);
  const [linkError, setLinkError] = React.useState<LinkError | null>(null);
  const linkSeqRef = React.useRef(0);

  const entryId = activeEntry.id;
  const videoId = activeEntry.videoId;

  React.useEffect(() => {
    linkSeqRef.current += 1;
    setExpanded(false);
    setCheckingLink(false);
    setLinkError(null);
    setCandidates([]);
  }, [entryId, videoId]);

  React.useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    fetch(`/api/queue/${joinCode}/karaoke-video?entryId=${encodeURIComponent(entryId)}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : { candidates: [] }))
      .catch(() => ({ candidates: [] }))
      .then((body: { candidates?: OriginalVideoCandidate[] }) => {
        if (!cancelled) setCandidates(body.candidates ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, joinCode, entryId]);

  const search = React.useCallback((q: string) => searchKaraokeVideos(joinCode, q), [joinCode]);

  function pick(id: string, source: SwapSource, meta?: OriginalVideoCandidate) {
    setLinkError(null);
    if (id === videoId) {
      setExpanded(false);
      return;
    }
    const known = meta ?? candidates.find((c) => c.videoId === id);
    if (known) {
      setExpanded(false);
      onSwap(entryId, known, source);
      return;
    }
    // A pasted link carries no title or length, and may not embed.
    const seq = ++linkSeqRef.current;
    setCheckingLink(true);
    lookupVideo(id, "paste", undefined, joinCode)
      .then((video) => {
        if (seq !== linkSeqRef.current) return;
        setCheckingLink(false);
        setExpanded(false);
        onSwap(
          entryId,
          {
            videoId: video.videoId,
            title: video.title,
            ...(video.durationSeconds ? { durationSeconds: video.durationSeconds } : {}),
          },
          source
        );
      })
      .catch((e) => {
        if (seq !== linkSeqRef.current) return;
        setCheckingLink(false);
        setLinkError(
          e instanceof SearchUnavailableError && e.reason === "not_embeddable" ? "notEmbeddable" : "linkFailed"
        );
      });
  }

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.label}>{t("karaokeVideo.card.title")}</span>
        <button className={styles.swapBtn} onClick={() => setExpanded((v) => !v)}>
          {t("karaokeVideo.card.swap")}
        </button>
      </div>

      {checkingLink ? (
        <div className={styles.skeleton} />
      ) : (
        <div className={styles.current}>
          <span className={styles.title}>{formatSongTitle(activeEntry.songTitle)}</span>
        </div>
      )}

      {linkError && <div className={styles.badLink}>{t(`karaokeVideo.card.${linkError}`)}</div>}

      {expanded && (
        <>
          {live && <div className={styles.expandedHeading}>{t("karaokeVideo.card.restarts")}</div>}
          <VideoSwapPanel
            candidates={candidates}
            currentId={videoId}
            onPick={pick}
            search={search}
            initialQuery={formatSongTitle(activeEntry.songTitle)}
            karaokeMode
          />
        </>
      )}
    </div>
  );
}
