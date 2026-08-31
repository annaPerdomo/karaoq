import * as React from "react";
import postUnplayableVideo from "../../app/queue/postUnplayableVideo";

// 101 and 150 are the owner disabling embedding, 100 a video gone or private.
// The rest (2, 5) are player faults that say nothing about the video.
const UNPLAYABLE_CODES = [100, 101, 150];

// One script and one ready callback per page, so every player waits on this.
let apiReady: Promise<any> | null = null;

function loadIframeApi(): Promise<any> {
  if (apiReady) return apiReady;
  apiReady = new Promise((resolve) => {
    const w = window as any;
    if (w.YT?.Player) {
      resolve(w.YT);
      return;
    }
    // Chained rather than replaced: the callback is a global anyone may own.
    const previous = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      if (typeof previous === "function") previous();
      resolve(w.YT);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    // An ad blocker or a captive portal eats the script; unlatching lets the next
    // song retry rather than wait on a promise that never settles.
    script.onerror = () => {
      apiReady = null;
      resolve(null);
    };
    document.head.appendChild(script);
  });
  return apiReady;
}

/**
 * Reports each video the embedded player refuses to play, once, and returns
 * whether the current entry failed. `active` must match the condition the iframe
 * renders under — the player attaches from the effect that follows its mount.
 */
export function usePlaybackError({
  videoRef,
  entryId,
  videoId,
  active,
}: {
  videoRef: React.RefObject<HTMLIFrameElement>;
  /** The queue entry the iframe is keyed on. Two entries can hold the same
   *  video, and each mounts an iframe that needs its own player. */
  entryId: string | undefined;
  videoId: string | undefined;
  active: boolean;
}): boolean {
  const [failedEntry, setFailedEntry] = React.useState<string | null>(null);
  // YouTube repeats onError; the corpus only needs to hear it once.
  const reportedRef = React.useRef(new Set<string>());

  React.useEffect(() => {
    if (!active || !entryId || !videoId) return;
    const iframe = videoRef.current;
    if (!iframe) return;

    let player: any = null;
    let dropped = false;

    loadIframeApi().then((YT) => {
      if (dropped || !YT?.Player) return;
      player = new YT.Player(iframe, {
        events: {
          onError: (e: { data?: number }) => {
            const code = Number(e?.data);
            if (UNPLAYABLE_CODES.indexOf(code) < 0) return;
            setFailedEntry(entryId);
            if (reportedRef.current.has(videoId)) return;
            reportedRef.current.add(videoId);
            postUnplayableVideo(videoId, code);
          },
        },
      });
    });

    return () => {
      dropped = true;
      // destroy() removes the iframe itself, but a passive cleanup runs after the
      // commit, so React has already taken it out and only the widget is freed.
      try {
        player?.destroy();
      } catch {}
      player = null;
    };
  }, [videoRef, entryId, videoId, active]);

  return active && failedEntry !== null && failedEntry === entryId;
}
