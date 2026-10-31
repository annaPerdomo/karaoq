import * as React from "react";
import styles from "./MusicVideoCard.module.css";
import { useT } from "../../lib/i18n/I18nProvider";
import { classifySearchInput } from "../../lib/videoLink";
import SearchBar from "../songsearch/SearchBar";
import type { OriginalVideoCandidate } from "../../lib/originalVideo";
import { SwapPreview } from "./SwapPreview";

export type SwapSource = "candidate" | "link" | "search";

export type SwapSearchOutcome =
  | { status: "ok"; candidates: OriginalVideoCandidate[] }
  | { status: "none" | "quota" | "failed" };

type SearchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; results: OriginalVideoCandidate[] }
  | { kind: "error"; message: "none" | "quota" | "failed" | "badLink" };

interface Preview {
  candidate: OriginalVideoCandidate;
  source: SwapSource;
  autoplay: boolean;
  /** Pasted links carry no metadata; the sheet resolves them itself. */
  meta: boolean;
}

function CandidateRow({
  candidate,
  active,
  onPreview,
}: {
  candidate: OriginalVideoCandidate;
  active: boolean;
  onPreview: (autoplay: boolean) => void;
}) {
  const { t } = useT();
  return (
    <div className={`${styles.candidate} ${styles.candidateRow} ${active ? styles.candidateActive : ""}`}>
      <button
        type="button"
        className={styles.candidateThumbBtn}
        onClick={() => onPreview(true)}
        title={t("search.confirm.previewVideo")}
        aria-label={t("search.confirm.previewVideo")}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- external YouTube thumbnail */}
        <img
          className={styles.candidateThumb}
          alt=""
          src={`https://i.ytimg.com/vi/${candidate.videoId}/mqdefault.jpg`}
        />
        <span className={styles.candidateThumbPlay} aria-hidden="true">▶</span>
      </button>
      <button type="button" className={`${styles.candidate} ${styles.candidateText}`} onClick={() => onPreview(false)}>
        <span className={styles.candidateTitle}>{candidate.title}</span>
      </button>
    </div>
  );
}

export function VideoSwapPanel({
  candidates,
  currentId,
  onPick,
  search: runSearch,
  previewMuted = false,
  karaokeMode = false,
}: {
  candidates: OriginalVideoCandidate[];
  currentId: string | null;
  onPick: (videoId: string, source: SwapSource, meta?: OriginalVideoCandidate) => void;
  search: (q: string) => Promise<SwapSearchOutcome>;
  previewMuted?: boolean;
  karaokeMode?: boolean;
}) {
  const { t } = useT();
  const [query, setQuery] = React.useState("");
  const [search, setSearch] = React.useState<SearchState>({ kind: "idle" });
  const searchSeqRef = React.useRef(0);
  const [preview, setPreview] = React.useState<Preview | null>(null);

  function submit() {
    const q = query.trim();
    const input = classifySearchInput(q);
    if (input.kind === "video") {
      searchSeqRef.current += 1;
      setSearch({ kind: "idle" });
      setQuery("");
      setPreview({
        candidate: { videoId: input.id, title: t("musicVideo.card.pasted") },
        source: "link",
        autoplay: false,
        meta: false,
      });
      return;
    }
    if (input.kind === "youtube-url" || input.kind === "url") {
      searchSeqRef.current += 1;
      setSearch({ kind: "error", message: "badLink" });
      return;
    }
    if (q.length < 2) return;
    const seq = ++searchSeqRef.current;
    setSearch({ kind: "loading" });
    runSearch(q).then((body) => {
      if (seq !== searchSeqRef.current) return;
      if (body.status === "ok") setSearch({ kind: "done", results: body.candidates });
      else setSearch({ kind: "error", message: body.status });
    });
  }

  function changeQuery(value: string) {
    setQuery(value);
    if (search.kind === "error") setSearch({ kind: "idle" });
    if (!value.trim()) {
      searchSeqRef.current += 1;
      setSearch({ kind: "idle" });
    }
  }

  const showingResults = search.kind === "done";

  if (preview) {
    const { candidate, source, meta } = preview;
    return (
      <SwapPreview
        key={candidate.videoId}
        candidate={candidate}
        autoplay={preview.autoplay}
        muted={previewMuted}
        onUse={() => onPick(candidate.videoId, source, meta ? candidate : undefined)}
        onBack={() => setPreview(null)}
      />
    );
  }

  return (
    <div className={styles.expanded}>
      <SearchBar
        className={styles.swapSearch}
        query={query}
        onQueryChange={changeQuery}
        onSearch={submit}
        searching={search.kind === "loading"}
        karaokeMode={karaokeMode}
      />
      {search.kind === "error" && (
        <div className={styles.badLink}>
          {t(
            search.message === "badLink"
              ? "musicVideo.card.badLink"
              : search.message === "quota"
                ? "musicVideo.card.searchQuota"
                : search.message === "none"
                  ? "musicVideo.card.searchNone"
                  : "musicVideo.card.searchFailed"
          )}
        </div>
      )}

      {!showingResults && candidates.length > 0 && (
        <div className={styles.expandedHeading}>{t("musicVideo.card.pick")}</div>
      )}
      <div className={styles.candidateList}>
        {showingResults
          ? search.results.map((c) => (
              <CandidateRow
                key={`s-${c.videoId}`}
                candidate={c}
                active={c.videoId === currentId}
                onPreview={(autoplay) => setPreview({ candidate: c, source: "search", autoplay, meta: true })}
              />
            ))
          : candidates.map((c) => (
              <CandidateRow
                key={c.videoId}
                candidate={c}
                active={c.videoId === currentId}
                onPreview={(autoplay) => setPreview({ candidate: c, source: "candidate", autoplay, meta: false })}
              />
            ))}
      </div>
    </div>
  );
}
