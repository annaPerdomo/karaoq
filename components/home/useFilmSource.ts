import * as React from 'react';
import {
  alphaSource,
  decodedWithAlpha,
  forcedSource,
  isTvBrowser,
  prefersReducedData,
  WEBM,
} from './heroFilm';

/**
 * Which encode of the demo film to play, or `null` for the poster.
 *
 * SSR, reduced-motion, Save-Data and TV browsers all get the poster — the
 * film's calm payoff frame. Shared by the landing hero and the guide articles
 * so both make the same per-engine alpha call (see heroFilm.ts); the caller
 * owns playback timing.
 */
export default function useFilmSource(tag: string) {
  const [src, setSrc] = React.useState<string | null>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  // Sticky: a decoder that dropped the plane must not be handed the film again
  // when the source pick re-runs (reduced-motion toggled back off).
  const alphaOkRef = React.useRef(true);

  React.useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const apply = () => {
      // `?film=` picks the encode; reduced-motion and Save-Data still veto the
      // film, since a diagnostic URL can be shared or bookmarked.
      const forced = forcedSource();
      if (mq.matches || prefersReducedData() || forced === null) return setSrc(null);
      // A TV vetoes the film too, but only when `?film=` hasn't named it:
      // that override is the one way to inspect the film on a set with no
      // devtools, so it must survive the check it exists to investigate.
      if (forced === undefined && isTvBrowser()) return setSrc(null);
      setSrc(forced ?? (alphaOkRef.current ? alphaSource() : null));
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const onLoadedData = React.useCallback(() => {
    const video = videoRef.current;
    // WebM only, and never under `?film=`, which exists to show what a
    // decoder does rather than rescue it. HEVC is Apple-only, where
    // alpha works and the readback is unverified.
    if (!video || src !== WEBM || forcedSource() !== undefined) return;
    if (decodedWithAlpha(video)) return;
    // No retry with the other encode: decoders that fail this drop
    // alpha from both.
    console.warn(`[${tag}] decoder dropped the alpha channel, using poster`, src);
    alphaOkRef.current = false;
    setSrc(null);
  }, [src, tag]);

  const onError = React.useCallback(() => {
    console.warn(`[${tag}] alpha video failed to load, falling back to poster`, src);
    setSrc(null);
  }, [src, tag]);

  return { src, videoRef, onLoadedData, onError };
}
