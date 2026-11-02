import * as React from "react";
import styles from "./MusicVideoCard.module.css";
import hostStyles from "../../styles/Host.module.css";
import { useT } from "../../lib/i18n/I18nProvider";
import type { OriginalVideoCandidate } from "../../lib/originalVideo";
import { SwapSearchOutcome, SwapSource, VideoSwapPanel } from "./VideoSwapPanel";

export type SwapListStatus = "ok" | "none" | "quota" | "busy";

export function VideoSwapSheet({
  title,
  subtitle,
  note,
  loading,
  status,
  error,
  candidates,
  currentId,
  onPick,
  search,
  previewMuted = false,
  karaokeMode = false,
  onClose,
}: {
  title: string;
  subtitle: string;
  note?: string;
  loading: boolean;
  status: SwapListStatus;
  error?: string | null;
  candidates: OriginalVideoCandidate[];
  currentId: string | null;
  onPick: (videoId: string, source: SwapSource, meta?: OriginalVideoCandidate) => void;
  search: (q: string) => Promise<SwapSearchOutcome>;
  previewMuted?: boolean;
  karaokeMode?: boolean;
  onClose: () => void;
}) {
  const { t } = useT();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const emptyMessage =
    loading || candidates.length > 0
      ? null
      : status === "quota"
        ? t("musicVideo.card.searchQuota")
        : status === "busy"
          ? t("musicVideo.card.searchFailed")
          : t("musicVideo.card.none");

  return (
    <div className={hostStyles.sheetOverlay} onClick={onClose}>
      <div
        className={hostStyles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={hostStyles.sheetHandle} />
        <div className={styles.sheetTitle}>{title}</div>
        <div className={styles.sheetSub}>{subtitle}</div>
        {note && <div className={styles.expandedHeading}>{note}</div>}
        {error && <div className={styles.badLink}>{error}</div>}
        {emptyMessage && <div className={styles.none}>{emptyMessage}</div>}
        <VideoSwapPanel
          candidates={candidates}
          currentId={currentId}
          onPick={onPick}
          search={search}
          previewMuted={previewMuted}
          karaokeMode={karaokeMode}
        />
        {loading && <div className={styles.skeleton} />}
        <button className={hostStyles.sheetDone} onClick={onClose}>
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
