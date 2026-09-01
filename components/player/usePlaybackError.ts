import * as React from "react";
import postUnplayableVideo from "../../app/queue/postUnplayableVideo";
import { UNPLAYABLE_PLAYER_CODES } from "../../lib/playbackCodes";

// One script and one ready callback per page, so every player waits on this.
let apiReady: Promise<any> | null = null;

/** A captive portal answers the connection and then says nothing, firing neither
 *  load nor error — unbounded, no song after it is ever watched. */
const API_TIMEOUT_MS = 10_000;

function loadIframeApi(): Promise<any> {
  if (apiReady) return apiReady;
  apiReady = new Promise((resolve) => {
    const w = window as any;
    if (w.YT?.Player) {
      resolve(w.YT);
      return;
    }
    const script = document.createElement("script");
    const giveUp = () => {
      apiReady = null;
      script.remove();
      resolve(null);
    };
    const timer = setTimeout(giveUp, API_TIMEOUT_MS);
    // Chained rather than replaced: the callback is a global anyone may own.
    const previous = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      if (typeof previous === "function") previous();
      clearTimeout(timer);
      resolve(w.YT);
    };
    // An ad blocker eats the script outright.
    script.onerror = () => {
      clearTimeout(timer);
      giveUp();
    };
    script.src = "https://www.youtube.com/iframe_api";
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
  roomId,
  entryId,
  videoId,
  active,
}: {
  videoRef: React.RefObject<HTMLIFrameElement>;
  /** The endpoint accepts a report only for a room that has the video queued —
   *  that guard is what keeps its re-verification from being free to buy. */
  roomId: string | undefined;
  /** The queue entry the iframe is keyed on. Two entries can hold the same
   *  video, and each mounts an iframe that needs its own player. */
  entryId: string | undefined;
  videoId: string | undefined;
  active: boolean;
}): boolean {
  const [failedEntry, setFailedEntry] = React.useState<string | null>(null);
  // YouTube repeats onError; the corpus only needs to hear it once.
  const reportedRef = React.useRef(new Set<string>());

  // Fetched during setup, not at the first song: onError is dispatched and never
  // replayed, so an embed that gives up before the script lands is unheard.
  React.useEffect(() => {
    void loadIframeApi();
  }, []);

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
            if (UNPLAYABLE_PLAYER_CODES.indexOf(code) < 0) return;
            setFailedEntry(entryId);
            if (!roomId || reportedRef.current.has(videoId)) return;
            reportedRef.current.add(videoId);
            postUnplayableVideo(roomId, videoId, code);
          },
        },
      });
    });

    return () => {
      dropped = true;
      // destroy() ends by removing the iframe from its parent, which React took
      // out first: parentless it throws part-way, leaking the window listener.
      if (player && !iframe.parentNode) {
        document.createDocumentFragment().appendChild(iframe);
      }
      try {
        player?.destroy();
      } catch (e: any) {
        console.warn("Player teardown failed:", e?.message);
      }
      player = null;
    };
  }, [videoRef, roomId, entryId, videoId, active]);

  return active && failedEntry === entryId;
}
