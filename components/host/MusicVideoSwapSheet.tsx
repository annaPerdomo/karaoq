import * as React from "react";
import type { OriginalVideoCandidate } from "../../lib/originalVideo";
import { useT } from "../../lib/i18n/I18nProvider";
import { SwapSearchOutcome, SwapSource } from "./VideoSwapPanel";
import { SwapListStatus, VideoSwapSheet } from "./VideoSwapSheet";

export type { SwapSource };

function searchOriginalVideos(joinCode: string, q: string): Promise<SwapSearchOutcome> {
  return fetch(`/api/queue/${joinCode}/original-video-search?q=${encodeURIComponent(q)}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("search failed"))))
    .then((body: { status: string; candidates: OriginalVideoCandidate[] }): SwapSearchOutcome =>
      body.status === "ok"
        ? { status: "ok", candidates: body.candidates }
        : { status: body.status === "quota" ? "quota" : body.status === "none" ? "none" : "failed" }
    )
    .catch((): SwapSearchOutcome => ({ status: "failed" }));
}

export function MusicVideoSwapSheet({
  joinCode,
  subtitle,
  loading,
  status,
  candidates,
  currentId,
  onPick,
  previewMuted,
  onClose,
}: {
  joinCode: string;
  subtitle: string;
  loading: boolean;
  status: SwapListStatus;
  candidates: OriginalVideoCandidate[];
  currentId: string | null;
  onPick: (videoId: string, source: SwapSource, meta?: OriginalVideoCandidate) => void;
  previewMuted: boolean;
  onClose: () => void;
}) {
  const { t } = useT();
  const search = React.useCallback((q: string) => searchOriginalVideos(joinCode, q), [joinCode]);
  return (
    <VideoSwapSheet
      title={t("musicVideo.swap")}
      subtitle={subtitle}
      loading={loading}
      status={status}
      candidates={candidates}
      currentId={currentId}
      onPick={onPick}
      search={search}
      previewMuted={previewMuted}
      onClose={onClose}
    />
  );
}
