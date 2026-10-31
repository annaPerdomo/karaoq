import * as React from "react";
import styles from "./MusicVideoCard.module.css";
import { useT } from "../../lib/i18n/I18nProvider";
import { classifySearchInput } from "../../lib/videoLink";
import SearchBar from "../songsearch/SearchBar";
import type { OriginalVideoCandidate } from "../../lib/originalVideo";

export type SwapSource = "candidate" | "link" | "search";

type SearchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; results: OriginalVideoCandidate[] }
  | { kind: "error"; message: "none" | "quota" | "failed" | "badLink" };

function CandidateRow({
  candidate,
  active,
  onPick,
}: {
  candidate: OriginalVideoCandidate;
  active: boolean;
  onPick: () => void;
}) {
  return (
    <button className={`${styles.candidate} ${active ? styles.candidateActive : ""}`} onClick={onPick}>
      {/* eslint-disable-next-line @next/next/no-img-element -- external YouTube thumbnail */}
      <img
        className={styles.candidateThumb}
        alt=""
        src={`https://i.ytimg.com/vi/${candidate.videoId}/mqdefault.jpg`}
      />
      <span className={styles.candidateTitle}>{candidate.title}</span>
    </button>
  );
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
  const { t } = useT();
  const [query, setQuery] = React.useState("");
  const [search, setSearch] = React.useState<SearchState>({ kind: "idle" });
  const searchSeqRef = React.useRef(0);

  function submit() {
    const q = query.trim();
    const input = classifySearchInput(q);
    if (input.kind === "video") {
      searchSeqRef.current += 1;
      setSearch({ kind: "idle" });
      setQuery("");
      onPick(input.id, "link");
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
    fetch(`/api/queue/${joinCode}/original-video-search?q=${encodeURIComponent(q)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("search failed"))))
      .then((body: { status: string; candidates: OriginalVideoCandidate[] }) => {
        if (seq !== searchSeqRef.current) return;
        if (body.status === "ok") setSearch({ kind: "done", results: body.candidates });
        else setSearch({ kind: "error", message: body.status === "quota" ? "quota" : body.status === "none" ? "none" : "failed" });
      })
      .catch(() => {
        if (seq === searchSeqRef.current) setSearch({ kind: "error", message: "failed" });
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

  return (
    <div className={styles.expanded}>
      <SearchBar
        className={styles.swapSearch}
        query={query}
        onQueryChange={changeQuery}
        onSearch={submit}
        searching={search.kind === "loading"}
        karaokeMode={false}
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
                onPick={() => onPick(c.videoId, "search", c)}
              />
            ))
          : candidates.map((c) => (
              <CandidateRow
                key={c.videoId}
                candidate={c}
                active={c.videoId === currentId}
                onPick={() => onPick(c.videoId, "candidate")}
              />
            ))}
      </div>
    </div>
  );
}
