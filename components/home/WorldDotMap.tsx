import * as React from 'react';
import styles from '../../styles/Home.module.css';
import { GRID } from '../../lib/home/worldDots';
import {
  buildBands,
  bandDelay,
  dotPath,
  hash01,
  ENTRANCE_END_MS,
  LIT_LAG_MS,
  NO_BANDS,
  TWINKLE_SPREAD_MS,
} from '../../lib/home/worldMapAnim';
import useOnScreen from './hooks/useOnScreen';

export interface WorldDotMapProps {
  /** ISO-3166-1 alpha-2 codes to light up. */
  countryCodes: string[];
  /** Accessible description of what the map is showing. */
  label: string;
  /** Flips true when the section scrolls into view; runs the entrance. */
  play: boolean;
}

// The world as a dot grid, with the countries KaraoQ has been sung in lit in the
// brand gradient — banded west to east so the whole map can sweep into place.
export default function WorldDotMap({ countryCodes, label, play }: WorldDotMapProps) {
  const [svgRef, onScreen] = useOnScreen<SVGSVGElement>();

  // Built after mount rather than during render: it's decorative, so keeping
  // ~3,400 path commands out of the server HTML is worth more than having them
  // in first paint — but building them on the scroll frame that flips `play`
  // would hand the user one long frame exactly when they're looking at it. The
  // bands mount invisible and CSS starts the sweep off `play` instead.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const { landBands, litBands, twinkles } = React.useMemo(
    () => (mounted ? buildBands(countryCodes) : NO_BANDS),
    [mounted, countryCodes]
  );

  return (
    <svg
      ref={svgRef}
      className={`${styles.reachMap} ${play ? styles.reachPlaying : ''} ${
        onScreen ? '' : styles.reachParked
      }`}
      viewBox={`0 0 ${GRID.cols} ${GRID.rows}`}
      role="img"
      aria-label={label}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        {/* userSpaceOnUse, not the default objectBoundingBox: every dot is a
            zero-area path, and a gradient in bounding-box units has no box to
            resolve against on those — the dots render as nothing at all. */}
        <linearGradient
          id="reachGradient"
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="0"
          x2={GRID.cols}
          y2="0"
        >
          <stop offset="0%" stopColor="#da2eff" />
          <stop offset="45%" stopColor="#9d4edd" />
          <stop offset="100%" stopColor="#00d9ff" />
        </linearGradient>
        {/* One blur per band, sized to that band's own dots. A filter's input is
            whatever its subtree renders, so a single filter over the whole glow
            group re-runs a map-sized Gaussian blur on every frame any one band
            is fading; per band, a fade dirties only its own strip and the bands
            that have landed keep their rasterised halo. userSpaceOnUse again —
            a band one column wide has a zero-width bounding box. */}
        {litBands.map((band, i) =>
          band ? (
            <filter
              key={`glowf-${i}`}
              id={`reachGlow${i}`}
              filterUnits="userSpaceOnUse"
              {...band.glowRegion}
            >
              <feGaussianBlur stdDeviation="0.9" />
            </filter>
          ) : null
        )}
      </defs>

      {landBands.map((d, band) =>
        d ? (
          <path
            key={`land-${band}`}
            className={styles.reachLand}
            style={{ animationDelay: `${bandDelay(band)}ms` }}
            d={d}
            stroke="currentColor"
            strokeWidth="0.58"
            strokeLinecap="round"
            fill="none"
          />
        ) : null
      )}

      {/* The halo rides the same bands as the lit layer — one fade for the whole
          group would put a blurred glow over countries whose dots hadn't
          arrived yet, which reads as the map leaking ahead of its own wave. */}
      <g className={styles.reachGlow}>
        {litBands.map((band, i) =>
          band ? (
            <path
              key={`glow-${i}`}
              className={styles.reachGlowBand}
              // The fade sits on the filtered element itself, not inside it, so
              // it composites over the blur rather than invalidating it.
              filter={`url(#reachGlow${i})`}
              style={{ animationDelay: `${bandDelay(i) + LIT_LAG_MS}ms` }}
              d={band.d}
              stroke="url(#reachGradient)"
              strokeWidth="1.9"
              strokeLinecap="round"
              fill="none"
            />
          ) : null
        )}
      </g>

      {litBands.map((band, i) =>
        band ? (
          <path
            key={`lit-${i}`}
            className={styles.reachLit}
            // Delay comes from the band's longitude, not its place in the country
            // list, so a country ignites when the wave reaches it — the
            // choreography holds however many countries come back, in any order.
            style={{ animationDelay: `${bandDelay(i) + LIT_LAG_MS}ms` }}
            d={band.d}
            stroke="url(#reachGradient)"
            strokeWidth="0.82"
            strokeLinecap="round"
            fill="none"
          />
        ) : null
      )}

      {twinkles.map((d) => (
        <path
          key={`twinkle-${d.x}-${d.y}`}
          className={styles.reachTwinkle}
          style={{
            animationDelay: `${ENTRANCE_END_MS + hash01(d.y, d.x) * TWINKLE_SPREAD_MS}ms`,
            // Varied per dot as well as offset: matching periods would drift
            // back into lockstep however far apart they started.
            animationDuration: `${3400 + hash01(d.x + 7, d.y + 3) * 2800}ms`,
          }}
          d={dotPath(d)}
          // White rather than the gradient: over a dot that's already magenta or
          // cyan, a bloom in its own colour barely registers, where a white core
          // reads as light catching on it.
          stroke="#fff"
          strokeWidth="0.82"
          strokeLinecap="round"
          fill="none"
        />
      ))}
    </svg>
  );
}
