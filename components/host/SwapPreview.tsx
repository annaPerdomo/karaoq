import * as React from "react";
import styles from "./MusicVideoCard.module.css";
import search from "../../styles/SongSearch.module.css";
import { useT } from "../../lib/i18n/I18nProvider";
import { embedSrc } from "../player/embed";
import { ytCommand } from "../player/ytCommand";
import type { OriginalVideoCandidate } from "../../lib/originalVideo";

export function SwapPreview({
  candidate,
  autoplay,
  muted,
  onUse,
  onBack,
}: {
  candidate: OriginalVideoCandidate;
  autoplay: boolean;
  /** A song is playing: in here-mode this page is the room's speakers. */
  muted: boolean;
  onUse: () => void;
  onBack: () => void;
}) {
  const { t } = useT();
  const [playing, setPlaying] = React.useState(autoplay);
  const [soundOn, setSoundOn] = React.useState(!muted);
  const frameRef = React.useRef<HTMLIFrameElement>(null);

  // Commands, not a reload: changing src would restart the preview.
  function toggleSound() {
    ytCommand(frameRef.current, soundOn ? "mute" : "unMute");
    setSoundOn(!soundOn);
  }

  return (
    <div className={styles.expanded}>
      <div className={search.previewWrap}>
        {playing ? (
          <iframe
            ref={frameRef}
            className={search.previewFrame}
            src={embedSrc(candidate.videoId, `autoplay=1&rel=0&enablejsapi=1${muted ? "&mute=1" : ""}`)}
            allow="autoplay; encrypted-media"
            allowFullScreen
            onLoad={() =>
              frameRef.current?.contentWindow?.postMessage(
                JSON.stringify({ event: "listening", id: "swap-preview" }),
                "https://www.youtube.com"
              )
            }
          />
        ) : (
          <button
            type="button"
            className={search.previewPlayBtn}
            onClick={() => setPlaying(true)}
            title={t("search.confirm.previewVideo")}
            aria-label={t("search.confirm.previewVideo")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- external YouTube thumbnail */}
            <img
              className={search.modalThumb}
              alt=""
              src={`https://i.ytimg.com/vi/${candidate.videoId}/mqdefault.jpg`}
            />
            <span className={search.previewPlayIcon}>▶</span>
          </button>
        )}
      </div>
      {playing && (
        <button type="button" className={styles.soundToggle} onClick={toggleSound} aria-pressed={soundOn}>
          {soundOn ? `🔊 ${t("swap.mute")}` : `🔇 ${t("swap.unmute")}`}
        </button>
      )}
      <div className={styles.previewTitle}>{candidate.title}</div>
      <div className={search.modalActions}>
        <button type="button" className={search.btnPrimary} onClick={onUse}>
          {t("swap.useThis")}
        </button>
        <button type="button" className={search.btnGhost} onClick={onBack}>
          {t("swap.back")}
        </button>
      </div>
    </div>
  );
}
