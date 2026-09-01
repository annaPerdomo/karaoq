import * as React from 'react';
import styles from '../../styles/Home.module.css';
import { alphaSource, decodedWithAlpha, prefersReducedData, POSTER, WEBM } from './heroFilm';

/**
 * When the film becomes visible — must match `.stageFilm`'s animation-delay.
 * Held paused until then rather than autoplaying under opacity 0, so it
 * doesn't start mid-story before the hero's follow-spot has even settled.
 *
 * Stacked below 1280px, the stage sits between pitch and form; the desktop
 * delay would leave the poster frozen there, so the reveal moves up.
 */
const REVEAL_MS_DESKTOP = 6400;
const REVEAL_MS_MOBILE = 2400;
const STACKED_QUERY = '(max-width: 1280px)';

export default function HeroStage() {
  // SSR and reduced-motion visitors get the poster — the film's calm payoff
  // frame, the same "most informative state" convention the other demos use.
  const [src, setSrc] = React.useState<string | null>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  // Sticky: a decoder that dropped the plane must not be handed the film again
  // when the source pick re-runs (reduced-motion toggled back off).
  const alphaOkRef = React.useRef(true);

  // Start the film on the beat it appears, from frame one.
  React.useEffect(() => {
    if (!src) return;
    const revealMs = window.matchMedia?.(STACKED_QUERY).matches
      ? REVEAL_MS_MOBILE
      : REVEAL_MS_DESKTOP;
    const id = window.setTimeout(() => {
      // Muted, so autoplay policy allows this; if it's refused anyway the
      // poster stays, which is the same fallback every other path uses.
      videoRef.current?.play().catch(() => {});
    }, revealMs);
    return () => window.clearTimeout(id);
  }, [src]);

  React.useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const apply = () =>
      setSrc(mq.matches || prefersReducedData() || !alphaOkRef.current ? null : alphaSource());
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  return (
    <div className={styles.heroStage} aria-hidden="true">
      <div className={styles.stageGlow} />
      <div className={styles.stageFilm}>
        {src ? (
          <video
            className={styles.stageMedia}
            // Keyed so switching source (reduced-motion toggled back off)
            // remounts rather than leaving a stale decoded frame.
            key={src}
            ref={videoRef}
            src={src}
            // No autoPlay: playback is started at REVEAL_MS above.
            muted
            loop
            playsInline
            preload="metadata"
            poster={POSTER}
            onLoadedData={() => {
              const video = videoRef.current;
              // WebM only: HEVC is Apple-only, where alpha works and the
              // readback is unverified.
              if (!video || src !== WEBM) return;
              if (decodedWithAlpha(video)) return;
              // No retry with the other encode: decoders that fail this drop
              // alpha from both.
              console.warn('[HeroStage] decoder dropped the alpha channel, using poster', src);
              alphaOkRef.current = false;
              setSrc(null);
            }}
            onError={() => {
              console.warn('[HeroStage] alpha video failed to load, falling back to poster', src);
              setSrc(null);
            }}
          />
        ) : (
          <img className={styles.stageMedia} src={POSTER} alt="" />
        )}
      </div>
      <div className={styles.stageFloor} />
    </div>
  );
}
