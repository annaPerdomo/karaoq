import * as React from "react";
import styles from "../../styles/MusicVideo.module.css";
import { embedSrc } from "../player/embed";
import { parseYtMessage, ytCommand } from "../player/ytCommand";
import { playerCurrentTime, playerDuration } from "../../lib/autoAdvance";

export default function MusicVideoPlayer({
  videoId,
  videoRef,
  onInfo,
  onError,
}: {
  videoId: string;
  videoRef: React.RefObject<HTMLIFrameElement>;
  /** Fired on every onStateChange/infoDelivery; currentTime/duration are null unless infoDelivery carried them. */
  onInfo: (currentTime: number | null, state: number | undefined, duration: number | null) => void;
  onError: (code: number) => void;
}) {
  React.useEffect(() => {
    function onMessage(e: MessageEvent) {
      const msg = parseYtMessage(e, videoRef.current);
      if (!msg) return;
      if (msg.event === "onError") {
        const code = Number(msg.info);
        if (Number.isFinite(code)) onError(code);
        return;
      }
      const state =
        msg.event === "onStateChange"
          ? msg.info
          : msg.event === "infoDelivery"
            ? msg.info?.playerState
            : undefined;
      onInfo(playerCurrentTime(msg), state, playerDuration(msg));
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [videoRef, onInfo, onError]);

  function handleLoad() {
    const iframe = videoRef.current;
    ytCommand(iframe, "mute");
    iframe?.contentWindow?.postMessage(
      JSON.stringify({ event: "listening", id: "karaoq-music-video" }),
      "https://www.youtube.com"
    );
  }

  return (
    <iframe
      ref={videoRef}
      key={videoId}
      className={styles.video}
      src={embedSrc(videoId, "mute=1&controls=0&playsinline=1&rel=0&enablejsapi=1")}
      allow="autoplay; encrypted-media"
      tabIndex={-1}
      onLoad={handleLoad}
    />
  );
}
