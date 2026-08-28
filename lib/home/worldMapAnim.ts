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

/** Filled, not stroked: the rays have to taper to a point. Both control points
 *  of every cubic sit on the centre — move them outward and the concave waist
 *  rounds off into a blob. */
export function sparklePath(d: Dot, r: number): string {
  const { x, y } = d;
  const c = `C${x} ${y} ${x} ${y} `;
  return `M${x} ${y - r}${c}${x + r} ${y}${c}${x} ${y + r}${c}${x - r} ${y}${c}${x} ${y - r}Z`;
}

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

/* Overlays on top of the lit bands, not members of them — a sparkle only ever
   brightens, so it never needs cutting out of the band beneath. Animating
   opacity and transform rather than stroke-width is what makes a scatter this
   size affordable: a scaling glyph doesn't re-tessellate a stroke every frame. */

/** A budget, not a target: every sparkle animates for as long as the tab is open. */
export const SPARKLE_COUNT = 150;
/** Jitter on a sparkle's start, about one cycle wide on purpose: narrow it and
    the field stays in phase, flaring as one and going near-dark between waves. */
export const SPARKLE_SPREAD_MS = 2400;
/** One sparkle's cycle, plus up to SPARKLE_CYCLE_RANGE_MS more per dot so
    matching periods can't drift back into lockstep. */
export const SPARKLE_CYCLE_MIN_MS = 2600;
export const SPARKLE_CYCLE_RANGE_MS = 2000;
/** How far a sparkle's rays reach, in grid cells. Bigger than the dot it sits
    on because the outer half of that reach is gradient falloff, not solid. */
export const SPARKLE_RADIUS = 1.75;
/**
 * When a sparkle may first glint: once its OWN band has landed, not once the
 * whole map has, so the glints chase the sweep rather than all waiting on the
 * slowest band. LIT_DURATION_MS and not the longer GLOW_DURATION_MS — the halo
 * underneath reads fine still fading in.
 */
export const sparkleStart = (d: Dot): number =>
  bandDelay(bandOf(d.x)) + LIT_LAG_MS + LIT_DURATION_MS;

// Deterministic 0..1 from a pair of numbers. The scatter has to be stable across
// re-renders — a fresh Math.random() each pass would re-roll which dots sparkle.
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
  sparkles: Dot[];
}

export const NO_BANDS: Bands = { landBands: [], litBands: [], sparkles: [] };

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

  return { landBands, litBands, sparkles: pickSparkles(countryCodes, world) };
}

/**
 * One sparkle per country first, the rest apportioned by the dots a country
 * owns. Breadth first because dots track landmass, so ordering by hash alone
 * leaves Singapore, Malta and Korea dark. That remainder tracks area, not
 * activity — it says "people here", never "more people here".
 */
function pickSparkles(countryCodes: string[], world: DecodedWorld): Dot[] {
  // Taking the head of a hash-ordered list scatters a country's picks across it
  // rather than clustering them where the grid happened to encode them first.
  const byHash = (a: Dot, b: Dot) => hash01(a.x, a.y) - hash01(b.x, b.y);

  const seenCode = new Set<string>();
  const queues = countryCodes
    .map((code) => code.toUpperCase())
    .filter((code) => {
      if (seenCode.has(code) || !world.byCountry.has(code)) return false;
      seenCode.add(code);
      return true;
    })
    .map((code) =>
      world.byCountry
        .get(code)!
        .map((index) => world.land[index])
        .sort(byHash)
    );

  const sparkles: Dot[] = [];
  // A microstate and its host share a cell (see SHARED_DOTS); without this the
  // two would stack sparkles on the same point and spend the budget twice.
  const taken = new Set<string>();
  const cursor = queues.map(() => 0);
  const take = (i: number): boolean => {
    if (sparkles.length >= SPARKLE_COUNT) return false;
    const dot = queues[i][cursor[i]];
    if (!dot) return false;
    cursor[i]++;
    const key = `${dot.x},${dot.y}`;
    if (!taken.has(key)) {
      taken.add(key);
      sparkles.push(dot);
    }
    return true;
  };

  // One each, in rank order so a list longer than the budget keeps the busiest.
  for (let i = 0; i < queues.length; i++) take(i);

  const totalDots = queues.reduce((n, q) => n + q.length, 0);
  const remaining = SPARKLE_COUNT - sparkles.length;
  if (remaining > 0 && totalDots > 0) {
    for (let i = 0; i < queues.length; i++) {
      const share = Math.floor((remaining * queues[i].length) / totalDots);
      for (let k = 0; k < share; k++) if (!take(i)) break;
    }
    for (let spent = 1; spent > 0 && sparkles.length < SPARKLE_COUNT; ) {
      spent = 0;
      for (let i = 0; i < queues.length; i++) if (take(i)) spent++;
    }
  }
  return sparkles;
}
