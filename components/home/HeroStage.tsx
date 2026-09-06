import * as React from 'react';
import styles from '../../styles/Home.module.css';
import { POSTER } from './heroFilm';
import useFilmSource from './useFilmSource';
import usePlayWhenVisible from './usePlayWhenVisible';

/**
 * When the film becomes visible — must match `.stageFilm`'s animation-delay.
 * Held paused until then rather than autoplaying under opacity 0, so it
 * doesn't start mid-story before the hero's follow-spot has even settled.
 *
 * Stacked below 1280px, the stage sits below the form; the desktop
 * delay would leave the poster frozen there, so the reveal moves up.
 */
const REVEAL_MS_DESKTOP = 6600;
const REVEAL_MS_MOBILE = 2600;
const STACKED_QUERY = '(max-width: 1280px)';

export default function HeroStage() {
  // SSR and reduced-motion visitors get the poster — the film's calm payoff
  // frame, the same "most informative state" convention the other demos use.
  const { src, videoRef, onLoadedData, onError } = useFilmSource('HeroStage');

  // matchMedia only after mount — the first render is the server's.
  const [revealMs, setRevealMs] = React.useState(REVEAL_MS_DESKTOP);
  React.useEffect(() => {
    setRevealMs(
      window.matchMedia?.(STACKED_QUERY).matches ? REVEAL_MS_MOBILE : REVEAL_MS_DESKTOP
    );
  }, []);
  usePlayWhenVisible(videoRef, src, revealMs);

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
            onLoadedData={onLoadedData}
            onError={onError}
          />
        ) : (
          <img className={styles.stageMedia} src={POSTER} alt="" />
        )}
      </div>
      <div className={styles.stageFloor} />
    </div>
  );
}
