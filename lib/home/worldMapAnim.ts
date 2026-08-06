import { GRID, WORLD_DOTS_RLE, SHARED_DOTS } from './worldDots';

export interface Dot {
  x: number;
  y: number;
}

export interface DecodedWorld {
  /** Every land cell, in row-major order. */
  land: Dot[];
  /** ISO-2 → indices into `land`. */
  byCountry: Map<string, number[]>;
}

let decoded: DecodedWorld | null = null;

// Lazily unpacks the RLE grid — ~10k cheap iterations, but no reason to pay
// them at module-evaluation time on the server.
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
export const dotPath = (d: Dot): string => `M${d.x} ${d.y}h.01`;

/* The entrance: the world draws itself west to east, and the lit countries
   ignite just behind the wave as it passes.

   Every dot in a band shares one delay — the sweep is a function of longitude,
   nothing else — so a band is drawn as a single <path> rather than one per dot,
   which is ~114 animating nodes instead of ~4,800. That only buys cheaper style
   recalc, though: it doesn't shrink the painted area a pixel, and painted area
   is what decides whether this is smooth on a throttled phone.
   Widening BAND_COLS coarsens the wave; narrowing it costs nodes. */

export const BAND_COLS = 3;
/** Beat between one band arriving and the next — the sweep's whole tempo. */
export const BAND_STEP_MS = 17;
/** Lead-in, so the section's own fade-in settles before the wave starts. */
export const SWEEP_START_MS = 260;
/** How far behind the land wave a lit country ignites. */
export const LIT_LAG_MS = 380;
/** Duration of `.reachLit` — the flare a country lands with. */
export const LIT_DURATION_MS = 800;
/** Duration of `.reachGlowBand` — the halo fading in under that flare. */
export const GLOW_DURATION_MS = 1100;

export const BAND_COUNT = Math.ceil(GRID.cols / BAND_COLS);
export const bandOf = (x: number): number => Math.floor(x / BAND_COLS);
export const bandDelay = (band: number): number => SWEEP_START_MS + band * BAND_STEP_MS;

/* The twinkle: once the map has settled, a scatter of lit dots keeps flaring on
   a slow loop so the band reads as alive rather than as a finished graphic.

   These are overlay dots drawn on top of the lit bands, not members of them —
   a sparkle brightens, it never dims, so it can sit above its band without
   needing to be cut out of it. Kept to a fixed handful because this animation
   runs forever, and a band spans the map's full height: animating one would
   dirty a tall column every frame, where a lone dot dirties a few pixels. */

/** How many lit dots twinkle. Every one is an element animating indefinitely. */
export const TWINKLE_COUNT = 34;
/** Window the twinkle start times are scattered over, so they never pulse in unison.
    Short enough that the whole scatter is cycling a few seconds after it starts —
    stretch it much further and the map sits visibly dead in between. */
export const TWINKLE_SPREAD_MS = 2800;
/** The last moment of the entrance — nothing twinkles until the map has landed.
    Takes whichever entrance animation finishes last, so retuning either one
    can't start the twinkle over a dot that's still arriving. */
export const ENTRANCE_END_MS =
  bandDelay(BAND_COUNT - 1) + LIT_LAG_MS + Math.max(LIT_DURATION_MS, GLOW_DURATION_MS);

// Deterministic 0..1 from a pair of numbers. The scatter has to be stable across
// re-renders — a fresh Math.random() each pass would re-roll which dots twinkle.
export function hash01(a: number, b: number): number {
  const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/** Room a band's halo needs around its dots: 3σ of the blur, plus half a stroke. */
const GLOW_MARGIN = 4;

export interface LitBand {
  d: string;
  /** Filter region for this band's halo, in user units. */
  glowRegion: { x: number; y: number; width: number; height: number };
}

export interface Bands {
  landBands: string[];
  litBands: (LitBand | null)[];
  twinkles: Dot[];
}

export const NO_BANDS: Bands = { landBands: [], litBands: [], twinkles: [] };

/**
 * Splits the world into the paths the map animates: one land path per band, one
 * lit path per band for the countries given, and the dots that twinkle after.
 */
export function buildBands(countryCodes: string[]): Bands {
  const world = decodeWorld();
  const lit = new Set<number>();
  for (const code of countryCodes) {
    for (const index of world.byCountry.get(code.toUpperCase()) ?? []) lit.add(index);
  }

  const landBands: string[] = Array(BAND_COUNT).fill('');
  const litPaths: string[] = Array(BAND_COUNT).fill('');
  // Each band's own bounding box, so its halo gets a filter region sized to the
  // countries in it rather than to the whole map.
  const bounds: ({ x0: number; y0: number; x1: number; y1: number } | null)[] =
    Array(BAND_COUNT).fill(null);
  const litDots: Dot[] = [];

  for (const dot of world.land) landBands[bandOf(dot.x)] += dotPath(dot);
  lit.forEach((index) => {
    const dot = world.land[index];
    const band = bandOf(dot.x);
    litPaths[band] += dotPath(dot);
    const box = bounds[band];
    if (box) {
      box.x0 = Math.min(box.x0, dot.x);
      box.y0 = Math.min(box.y0, dot.y);
      box.x1 = Math.max(box.x1, dot.x);
      box.y1 = Math.max(box.y1, dot.y);
    } else {
      bounds[band] = { x0: dot.x, y0: dot.y, x1: dot.x, y1: dot.y };
    }
    litDots.push(dot);
  });

  const litBands = litPaths.map((d, band) => {
    const box = bounds[band];
    if (!d || !box) return null;
    return {
      d,
      glowRegion: {
        x: box.x0 - GLOW_MARGIN,
        y: box.y0 - GLOW_MARGIN,
        width: box.x1 - box.x0 + GLOW_MARGIN * 2,
        height: box.y1 - box.y0 + GLOW_MARGIN * 2,
      },
    };
  });

  // Ordering by hash is a deterministic shuffle: taking the head of it spreads
  // the twinkles over the whole lit area, and a short country list simply
  // twinkles every dot it has rather than none.
  const twinkles = litDots
    .slice()
    .sort((a, b) => hash01(a.x, a.y) - hash01(b.x, b.y))
    .slice(0, TWINKLE_COUNT);

  return { landBands, litBands, twinkles };
}
