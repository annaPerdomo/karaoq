import * as React from "react";
import styles from "../../styles/MusicVideo.module.css";
import { useT } from "../../lib/i18n/I18nProvider";
import formatSongTitle from "../../lib/songTitle";
import { cleanSongTitle } from "../../lib/originalVideo";

// YouTube's placeholder for a video with no maxres thumbnail is a small
// solid-color image — this is the only reliable signal it's not a real frame.
const MAXRES_PLACEHOLDER_WIDTH = 120;

function thumbSrc(videoId: string, size: "maxresdefault" | "hqdefault"): string {
  return `https://i.ytimg.com/vi/${videoId}/${size}.jpg`;
}

export default function MusicVideoIdle({
  singerName,
  songTitle,
  reason,
  thumbnailId,
}: {
  singerName?: string;
  songTitle?: string;
  reason: "waiting" | "unavailable";
  thumbnailId: string | null;
}) {
  const { t } = useT();
  // Keyed by video id, not a boolean: a new thumbnailId must start at maxres
  // before the reset effect below runs.
  const [fellBackFor, setFellBackFor] = React.useState<string | null>(null);
  // The img stays hidden until this matches src, so neither the placeholder
  // nor the fallback swap ever flashes on screen.
  const [validatedSrc, setValidatedSrc] = React.useState<string | null>(null);

  React.useEffect(() => {
    setFellBackFor(null);
    setValidatedSrc(null);
  }, [thumbnailId]);

  const usingHq = fellBackFor === thumbnailId;
  const src = thumbnailId ? thumbSrc(thumbnailId, usingHq ? "hqdefault" : "maxresdefault") : null;

  function handleError() {
    if (thumbnailId && !usingHq) setFellBackFor(thumbnailId);
  }

  function handleLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    if (!thumbnailId) return;
    if (!usingHq && e.currentTarget.naturalWidth <= MAXRES_PLACEHOLDER_WIDTH) {
      setFellBackFor(thumbnailId);
      return;
    }
    setValidatedSrc(src);
  }

  return (
    <div className={`${styles.idle} ${thumbnailId ? styles.idleWithThumb : ""}`}>
      {src && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- external YouTube thumbnail */}
          <img
            key={src}
            className={[
              styles.idleThumb,
              validatedSrc === src ? styles.idleThumbShown : "",
              usingHq ? styles.idleThumbCropped : "",
            ].join(" ")}
            alt=""
            src={src}
            onError={handleError}
            onLoad={handleLoad}
          />
          <div className={styles.idleThumbScrim} />
        </>
      )}
      {singerName && (
        <>
          <p className={styles.idleLabel}>{t("display.upNextTitle")}</p>
          <p className={styles.idleSinger}>{singerName}</p>
        </>
      )}
      {songTitle && (
        <p className={styles.idleSong}>{formatSongTitle(cleanSongTitle(songTitle) ?? songTitle)}</p>
      )}
      {reason === "unavailable" && (
        <p className={styles.idleText}>{t("musicVideo.unavailable")}</p>
      )}
    </div>
  );
}
