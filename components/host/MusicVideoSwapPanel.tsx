import * as React from "react";
import styles from "./MusicVideoCard.module.css";
import { useT } from "../../lib/i18n/I18nProvider";
import { classifySearchInput } from "../../lib/videoLink";
import type { OriginalVideoCandidate } from "../../lib/originalVideo";

export type SwapSource = "candidate" | "link" | "search";

type SearchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; results: OriginalVideoCandidate[] }
  | { kind: "error"; message: "none" | "quota" | "failed" };

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
  const [linkValue, setLinkValue] = React.useState("");
  const [badLink, setBadLink] = React.useState(false);
  const searchSeqRef = React.useRef(0);

  function runSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
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

  function useLink() {
    const input = classifySearchInput(linkValue.trim());
    if (input.kind !== "video") {
      setBadLink(true);
      return;
    }
    onPick(input.id, "link");
    setLinkValue("");
  }

  return (
    <div className={styles.expanded}>
      <div className={styles.expandedHeading}>{t("musicVideo.card.pick")}</div>
      {candidates.map((c) => (
        <CandidateRow
          key={c.videoId}
          candidate={c}
          active={c.videoId === currentId}
          onPick={() => onPick(c.videoId, "candidate")}
        />
      ))}

      <form className={styles.linkRow} onSubmit={runSearch}>
        <input
          className={styles.linkInput}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("musicVideo.card.search")}
          aria-label={t("musicVideo.card.search")}
        />
        <button className={styles.useBtn} type="submit" disabled={search.kind === "loading"}>
          {t("musicVideo.card.searchGo")}
        </button>
      </form>
      {search.kind === "loading" && <div className={styles.skeleton} />}
      {search.kind === "error" && (
        <div className={styles.badLink}>
          {t(
            search.message === "quota"
              ? "musicVideo.card.searchQuota"
              : search.message === "none"
                ? "musicVideo.card.searchNone"
                : "musicVideo.card.searchFailed"
          )}
        </div>
      )}
      {search.kind === "done" &&
        search.results.map((c) => (
          <CandidateRow
            key={`s-${c.videoId}`}
            candidate={c}
            active={c.videoId === currentId}
            onPick={() => onPick(c.videoId, "search", c)}
          />
        ))}

      <div className={styles.linkRow}>
        <input
          className={styles.linkInput}
          value={linkValue}
          onChange={(e) => {
            setLinkValue(e.target.value);
            setBadLink(false);
          }}
          placeholder={t("musicVideo.card.paste")}
        />
        <button className={styles.useBtn} onClick={useLink}>
          {t("musicVideo.card.use")}
        </button>
      </div>
      {badLink && <div className={styles.badLink}>{t("musicVideo.card.badLink")}</div>}
    </div>
  );
}
