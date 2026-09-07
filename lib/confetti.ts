/** Pure simulation of the post-song confetti; StageScene draws it. Units are
 * stage px and seconds; motion scales with stage height so every screen sees the same arc. */

export type Rng = () => number;

export type Stage = { width: number; height: number };

export type Shape = "rect" | "ribbon" | "dot";

export type Piece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Half-extents, px. Ribbons are long and thin; dots are round. */
  w: number;
  h: number;
  shape: Shape;
  color: string;
  /** In-plane rotation and its rate, radians. */
  rot: number;
  rotV: number;
  /** Tumble about the long axis: cos(tilt) is the visible width. */
  tilt: number;
  tiltV: number;
  /** Sideways rock: phase, rate, and amplitude (px/s). */
  sway: number;
  swayV: number;
  swayAmp: number;
  /** Air drag on the launch, 1/s. */
  drag: number;
  /** The speed it settles into when falling, px/s. */
  terminal: number;
  /** Seconds after the burst starts that it leaves the barrel. */
  born: number;
  /** Seconds it stays visible after leaving the barrel, before fading. */
  life: number;
  age: number;
  alpha: number;
  alive: boolean;
};

export const DEFAULT_ACCENTS: [string, string] = ["#ff2d78", "#00f0ff"];

/** First shot to last piece gone; --reveal (styles/Countdown.module.css) waits on it. */
export const BURST_SECONDS = 4.2;

const EMIT_WINDOW = 0.3;
const RIGHT_CANNON_LAG = 0.1;

const GRAVITY_PER_H = 1.9;
const FADE_SECONDS = 0.6;

function pick<T>(items: T[], weights: number[], rng: Rng): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

function between(rng: Rng, lo: number, hi: number): number {
  return lo + (hi - lo) * rng();
}

export function pieceCount(stage: Stage): number {
  const byArea = Math.round((stage.width * stage.height) / 14000);
  return Math.max(40, Math.min(120, byArea));
}

export function pieceUnit(stage: Stage): number {
  return Math.max(4.5, Math.min(9, stage.width / 170));
}

// --- Palette ---------------------------------------------------------------

type Rgb = [number, number, number];

/** Null for anything but `#rgb`, `#rrggbb` or `rgb(r, g, b)`, so an odd theme token falls back to classic. */
export function parseColor(input: string): Rgb | null {
  const s = input.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(s);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
}

function toCss([r, g, b]: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`;
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as Rgb;
}

const WHITE: Rgb = [255, 255, 255];

export function paletteFrom(accA: string, accB: string): string[] {
  const a = parseColor(accA) ?? parseColor(DEFAULT_ACCENTS[0])!;
  const b = parseColor(accB) ?? parseColor(DEFAULT_ACCENTS[1])!;
  return [toCss(a), toCss(b), toCss(mix(a, WHITE, 0.4)), toCss(mix(b, WHITE, 0.4)), toCss(WHITE)];
}

const PALETTE_WEIGHTS = [4, 4, 2, 2, 1];

const shaded = new Map<string, string>();

export function backColor(color: string): string {
  const cached = shaded.get(color);
  if (cached) return cached;
  const rgb = parseColor(color) ?? WHITE;
  const out = toCss(rgb.map((c) => Math.round(c * 0.62)) as Rgb);
  shaded.set(color, out);
  return out;
}

// --- Spawn -----------------------------------------------------------------

function spawnPiece(stage: Stage, side: -1 | 1, palette: string[], rng: Rng): Piece {
  const H = stage.height;
  const u = pieceUnit(stage);
  const shape: Shape = pick<Shape>(["rect", "ribbon", "dot"], [6, 2, 2], rng);

  // Angle from vertical, leaning toward the centre of the stage.
  const lean = between(rng, 0.2, 0.75) * (rng() < 0.15 ? 1.25 : 1);
  const speed = H * between(rng, 1.9, 2.9);
  const reach = Math.min(1, stage.width / (0.9 * H));
  const vx = Math.sin(lean) * speed * side * reach;
  const vy = -Math.cos(lean) * speed;

  const w = u * between(rng, 0.45, 0.7);
  const h = shape === "ribbon" ? w * between(rng, 3.5, 5.5) : shape === "dot" ? w : w * between(rng, 1.4, 2.1);

  return {
    x: side === 1 ? -u * 2 : stage.width + u * 2,
    y: H + u * 2,
    vx,
    vy,
    w,
    h,
    shape,
    color: pick(palette, PALETTE_WEIGHTS.slice(0, palette.length), rng),
    rot: rng() * Math.PI * 2,
    rotV: between(rng, 1.5, 4) * (rng() < 0.5 ? -1 : 1),
    tilt: rng() * Math.PI * 2,
    tiltV: between(rng, 6, 12) * (rng() < 0.5 ? -1 : 1),
    sway: rng() * Math.PI * 2,
    swayV: between(rng, 2, 3.5),
    swayAmp: u * between(rng, 2.5, 5),
    drag: between(rng, 0.9, 1.3),
    terminal: H * between(rng, 0.2, 0.28) * (shape === "ribbon" ? 0.85 : shape === "dot" ? 1.15 : 1),
    born: between(rng, 0, EMIT_WINDOW) + (side === -1 ? RIGHT_CANNON_LAG : 0),
    life: between(rng, 2.4, BURST_SECONDS - FADE_SECONDS - EMIT_WINDOW - RIGHT_CANNON_LAG),
    age: 0,
    alpha: 1,
    alive: true,
  };
}

export function spawnBurst(
  stage: Stage,
  rng: Rng = Math.random,
  palette: string[] = paletteFrom(...DEFAULT_ACCENTS)
): Piece[] {
  const count = pieceCount(stage);
  const pieces: Piece[] = [];
  for (let i = 0; i < count; i++) {
    pieces.push(spawnPiece(stage, i % 2 === 0 ? 1 : -1, palette, rng));
  }
  return pieces;
}

// --- Step ------------------------------------------------------------------

/** `t` is seconds since the burst began; returns how many pieces are still on stage. */
export function stepPieces(pieces: Piece[], dt: number, t: number, stage: Stage): number {
  const g = GRAVITY_PER_H * stage.height;
  const floor = stage.height + 40;
  let alive = 0;
  for (const p of pieces) {
    if (!p.alive) continue;
    if (t < p.born) {
      alive++;
      continue;
    }
    p.age += dt;

    const k = Math.exp(-p.drag * dt);
    p.vx *= k;
    if (p.vy < 0) p.vy *= k;
    p.vy += g * dt;

    // Quadratic drag eases the piece into its terminal speed; `falling` is how settled it is.
    let falling = 0;
    if (p.vy > 0) {
      const ratio = p.vy / p.terminal;
      p.vy -= g * ratio * ratio * dt;
      falling = Math.min(1, ratio);
      p.vx *= Math.exp(-3 * falling * dt);
    }

    p.sway += p.swayV * dt;
    p.x += (p.vx + Math.sin(p.sway) * p.swayAmp * falling) * dt;
    p.y += p.vy * dt;

    p.tilt += p.tiltV * dt;
    p.rot += p.rotV * dt;
    const settle = Math.exp(-1.2 * falling * dt);
    if (Math.abs(p.tiltV) > 3) p.tiltV *= settle;
    if (Math.abs(p.rotV) > 1) p.rotV *= settle;

    if (p.age > p.life) {
      p.alpha = Math.max(0, 1 - (p.age - p.life) / FADE_SECONDS);
    }

    const gone =
      p.alpha <= 0 ||
      p.y > floor ||
      p.x < -stage.width * 0.2 ||
      p.x > stage.width * 1.2;
    if (gone) {
      p.alive = false;
    } else {
      alive++;
    }
  }
  return alive;
}

// --- Draw ------------------------------------------------------------------

/** The caller has sized and cleared the canvas and set the device-pixel transform. */
export function drawPieces(ctx: CanvasRenderingContext2D, pieces: Piece[], t: number): void {
  for (const p of pieces) {
    if (!p.alive || t < p.born) continue;
    const face = Math.cos(p.tilt);
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    // Never quite zero, so it doesn't blink out mid-turn.
    ctx.scale(Math.max(0.08, Math.abs(face)), 1);
    ctx.fillStyle = face >= 0 ? p.color : backColor(p.color);
    if (p.shape === "dot") {
      ctx.beginPath();
      ctx.arc(0, 0, p.w, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(-p.w, -p.h, p.w * 2, p.h * 2);
    }
    ctx.restore();
  }
}
