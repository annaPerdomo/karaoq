import * as React from "react";
import { useT } from "../../lib/i18n/I18nProvider";
import { QueueEntry } from "../../pages/api/types";
import type { OriginalVideoCandidate } from "../../lib/originalVideo";
import { buildSearchQuery } from "../../lib/searchQuery";
import searchYoutube, { SearchUnavailableError } from "../../app/queue/searchYoutube";
import lookupVideo from "../../app/queue/lookupVideo";
import postScreenEvent from "../../app/queue/screenEvent";
import { SwapSearchOutcome, SwapSource } from "./VideoSwapPanel";
import { SwapListStatus, VideoSwapSheet } from "./VideoSwapSheet";
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

export function KaraokeSwapSheet({
  joinCode,
  entry,
  live,
  roomPlaying,
  onClose,
  onSwap,
}: {
  joinCode: string;
  entry: QueueEntry;
  live: boolean;
  roomPlaying: boolean;
  onClose: () => void;
  onSwap: (entryId: string, video: OriginalVideoCandidate, source: SwapSource) => void;
}) {
  const { t } = useT();
  const [candidates, setCandidates] = React.useState<OriginalVideoCandidate[]>([]);
  const [status, setStatus] = React.useState<SwapListStatus>("ok");
  const [loading, setLoading] = React.useState(true);
  const [checkingLink, setCheckingLink] = React.useState(false);
  const [linkError, setLinkError] = React.useState<LinkError | null>(null);
  const linkSeqRef = React.useRef(0);
  // Cancel must abort a link still resolving, or it swaps (and restarts) after close.
  React.useEffect(() => () => {
    linkSeqRef.current += 1;
  }, []);

  const entryId = entry.id;
  const videoId = entry.videoId;

  React.useEffect(() => {
    postScreenEvent(joinCode, "karaoke_swap_opened", { live });
    // Once per opening, not per poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinCode, entryId]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/queue/${joinCode}/karaoke-video?entryId=${encodeURIComponent(entryId)}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : { status: "busy", candidates: [] }))
      .catch(() => ({ status: "busy", candidates: [] }))
      .then((body: { status?: SwapListStatus; candidates?: OriginalVideoCandidate[] }) => {
        if (cancelled) return;
        setCandidates(body.candidates ?? []);
        setStatus(body.status ?? "ok");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [joinCode, entryId]);

  const search = React.useCallback((q: string) => searchKaraokeVideos(joinCode, q), [joinCode]);

  function swapTo(video: OriginalVideoCandidate, source: SwapSource) {
    onSwap(entryId, video, source);
    onClose();
  }

  function pick(id: string, source: SwapSource, meta?: OriginalVideoCandidate) {
    setLinkError(null);
    if (id === videoId) {
      onClose();
      return;
    }
    const known = meta ?? candidates.find((c) => c.videoId === id);
    if (known) {
      swapTo(known, source);
      return;
    }
    // A pasted link carries no title or length, and may not embed.
    const seq = ++linkSeqRef.current;
    setCheckingLink(true);
    lookupVideo(id, "paste", undefined, joinCode)
      .then((video) => {
        if (seq !== linkSeqRef.current) return;
        setCheckingLink(false);
        swapTo(
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
    <VideoSwapSheet
      title={t("karaokeVideo.swap")}
      subtitle={`${entry.userName} · ${formatSongTitle(entry.songTitle)}`}
      note={live ? t("karaokeVideo.card.restarts") : undefined}
      loading={loading || checkingLink}
      status={status}
      error={linkError ? t(`karaokeVideo.card.${linkError}`) : null}
      candidates={candidates}
      currentId={videoId}
      onPick={pick}
      search={search}
      previewMuted={roomPlaying}
      karaokeMode
      onClose={onClose}
    />
  );
}
