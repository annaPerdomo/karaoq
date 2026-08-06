import * as React from 'react';
import styles from '../../styles/Home.module.css';
import { GRID, WORLD_DOTS_RLE, SHARED_DOTS } from '../../lib/home/worldDots';

interface Dot {
  x: number;
  y: number;
}

interface DecodedWorld {
  /** Every land cell, in row-major order. */
  land: Dot[];
  /** ISO-2 → indices into `land`. */
  byCountry: Map<string, number[]>;
}

let decoded: DecodedWorld | null = null;

// Lazily unpacks the RLE grid — ~10k cheap iterations, but no reason to pay
// them at module-evaluation time on the server. Exported for direct testing.
export function decodeWorld(): DecodedWorld {
  if (decoded) return decoded;
  const land: Dot[] = [];
  const byCountry = new Map<string, number[]>();
  const landIndexByCell = new Map<number, number>();

  let cell = 0;
  for (const run of WORLD_DOTS_RLE.split(',')) {
    const code = run.slice(0, 2);
    const isSea = code[0] === '-';
    const length = Number(isSea ? run.slice(1) : run.slice(2));
    if (isSea) {
      cell += length;
      continue;
    }
    let indices = byCountry.get(code);
    if (!indices) {
      indices = [];
      byCountry.set(code, indices);
    }
    for (let i = 0; i < length; i++, cell++) {
      indices.push(land.length);
      landIndexByCell.set(cell, land.length);
      land.push({ x: (cell % GRID.cols) + 0.5, y: Math.floor(cell / GRID.cols) + 0.5 });
    }
  }

  // Microstates that were too small to win a cell of their own borrow their
  // neighbour's dot, so they light up like everyone else.
  for (const [code, cellIndex] of Object.entries(SHARED_DOTS)) {
    const landIndex = landIndexByCell.get(cellIndex);
    if (landIndex == null) continue;
    const existing = byCountry.get(code);
    if (existing) existing.push(landIndex);
    else byCountry.set(code, [landIndex]);
  }

  decoded = { land, byCountry };
  return decoded;
}

/** A dot's `d` command — a zero-length line that a round linecap turns into a dot. */
const dotPath = (d: Dot): string => `M${d.x} ${d.y}h.01`;

export interface WorldDotMapProps {
  /** ISO-3166-1 alpha-2 codes to light up. */
  countryCodes: string[];
  /** Accessible description of what the map is showing. */
  label: string;
}

// The world as a dot grid, with the countries KaraoQ has been sung in lit in the
// brand gradient. The land layer is a single <path> (3,400 dots as one node);
// only the lit dots — a few dozen at most — get their own element, so each can
// fade in on its own beat.
export default function WorldDotMap({ countryCodes, label }: WorldDotMapProps) {
  // Rendered after mount only: it's decorative, and keeping ~3,400 path
  // commands out of the server HTML matters more than having it in first paint.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const { landPath, litDots } = React.useMemo(() => {
    if (!mounted) return { landPath: '', litDots: [] as Dot[] };
    const world = decodeWorld();
    const lit = new Set<number>();
    for (const code of countryCodes) {
      for (const index of world.byCountry.get(code.toUpperCase()) ?? []) lit.add(index);
    }
    return {
      landPath: world.land.map(dotPath).join(''),
      // Ordered west to east so the light sweeps across the map rather than
      // popping on in whatever order the country list happened to arrive in.
      litDots: Array.from(lit, (i) => world.land[i]).sort((a, b) => a.x - b.x),
    };
  }, [mounted, countryCodes]);

  return (
    <svg
      className={styles.reachMap}
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
        <filter id="reachGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.9" />
        </filter>
      </defs>

      {landPath && (
        <path
          d={landPath}
          stroke="currentColor"
          strokeWidth="0.58"
          strokeLinecap="round"
          fill="none"
        />
      )}

      <g filter="url(#reachGlow)" className={styles.reachGlow}>
        {litDots.map((d) => (
          <path
            key={`glow-${d.x}-${d.y}`}
            d={dotPath(d)}
            stroke="url(#reachGradient)"
            strokeWidth="1.9"
            strokeLinecap="round"
            fill="none"
          />
        ))}
      </g>
      {litDots.map((d, i) => (
        <path
          key={`lit-${d.x}-${d.y}`}
          className={styles.reachLit}
          // Staggered west-to-east, capped so a wide country list still finishes
          // its sweep in about a second rather than trickling in for a minute.
          style={{ animationDelay: `${Math.min(i * 22, 900)}ms` }}
          d={dotPath(d)}
          stroke="url(#reachGradient)"
          strokeWidth="0.82"
          strokeLinecap="round"
          fill="none"
        />
      ))}
    </svg>
  );
}
