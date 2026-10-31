import * as React from "react";
import styles from "./MusicVideoCard.module.css";
import { embedSrc } from "../player/embed";
import { parseYtMessage, ytCommand } from "../player/ytCommand";

const SEEK_THROTTLE_MS = 150;

/** A muted, paused player seeked to the scrubber's thumb: YouTube's storyboard
 *  thumbnails aren't exposed through its API. */
export function ScrubPreview({ videoId, seconds }: { videoId: string; seconds: number }) {
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const readyRef = React.useRef(false);
  const lastSeekRef = React.useRef(0);
  const pendingRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const secondsRef = React.useRef(seconds);
  secondsRef.current = seconds;
  const [startAt] = React.useState(() => Math.floor(seconds));
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    readyRef.current = false;
    function onMessage(e: MessageEvent) {
      const msg = parseYtMessage(e, iframeRef.current);
      if (!msg) return;
      const state = msg.event === "onStateChange" ? msg.info : msg.event === "infoDelivery" ? msg.info?.playerState : undefined;
      // It has to start playing once before a seek will paint a still frame;
      // freeze it the moment it does.
      if (state === 1 && !readyRef.current) {
        readyRef.current = true;
        ytCommand(iframeRef.current, "pauseVideo");
        ytCommand(iframeRef.current, "seekTo", [secondsRef.current, true]);
        setReady(true);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [videoId]);

  React.useEffect(() => {
    if (!readyRef.current) return;
    const seek = () => {
      lastSeekRef.current = Date.now();
      ytCommand(iframeRef.current, "seekTo", [secondsRef.current, true]);
    };
    if (pendingRef.current) clearTimeout(pendingRef.current);
    const wait = SEEK_THROTTLE_MS - (Date.now() - lastSeekRef.current);
    if (wait <= 0) seek();
    else pendingRef.current = setTimeout(seek, wait);
    return () => {
      if (pendingRef.current) clearTimeout(pendingRef.current);
    };
  }, [seconds]);

  function handleLoad() {
    const iframe = iframeRef.current;
    iframe?.contentWindow?.postMessage(
      JSON.stringify({ event: "listening", id: "karaoq-scrub-preview" }),
      "https://www.youtube.com"
    );
    ytCommand(iframe, "mute");
  }

  return (
    <iframe
      ref={iframeRef}
      key={videoId}
      className={`${styles.previewFrame} ${ready ? styles.previewFrameReady : ""}`}
      src={embedSrc(
        videoId,
        `autoplay=1&mute=1&controls=0&disablekb=1&fs=0&iv_load_policy=3&modestbranding=1&playsinline=1&rel=0&cc_load_policy=0&enablejsapi=1&start=${startAt}`
      )}
      allow="autoplay; encrypted-media"
      tabIndex={-1}
      title=""
      onLoad={handleLoad}
    />
  );
}
