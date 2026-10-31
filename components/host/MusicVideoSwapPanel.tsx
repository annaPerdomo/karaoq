import * as React from "react";
import type { OriginalVideoCandidate } from "../../lib/originalVideo";
import { SwapSearchOutcome, SwapSource, VideoSwapPanel } from "./VideoSwapPanel";

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

export function MusicVideoSwapPanel({
  joinCode,
  candidates,
  currentId,
  onPick,
}: {
  joinCode: string;
  candidates: OriginalVideoCandidate[];
  currentId: string | null;
  onPick: (videoId: string, source: SwapSource, meta?: OriginalVideoCandidate) => void;
}) {
  const search = React.useCallback((q: string) => searchOriginalVideos(joinCode, q), [joinCode]);
  return (
    <VideoSwapPanel candidates={candidates} currentId={currentId} onPick={onPick} search={search} />
  );
}
