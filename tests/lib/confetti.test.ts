import { describe, it, expect } from "vitest";
import {
  BURST_SECONDS,
  backColor,
  paletteFrom,
  parseColor,
  pieceCount,
  pieceUnit,
  spawnBurst,
  stepPieces,
  type Stage,
} from "../../lib/confetti";

function seeded(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function simulate(stage: Stage) {
  const pieces = spawnBurst(stage, seeded());
  const apex = pieces.map(() => Infinity);
  const dt = 1 / 60;
  let t = 0;
  let ended = Infinity;
  while (t < BURST_SECONDS + 2) {
    const alive = stepPieces(pieces, dt, t, stage);
    t += dt;
    pieces.forEach((p, i) => {
      if (p.alive && t >= p.born) apex[i] = Math.min(apex[i], p.y);
    });
    if (alive === 0) {
      ended = t;
      break;
    }
  }
  const heights = apex
    .filter((y) => y !== Infinity)
    .map((y) => (stage.height - y) / stage.height)
    .sort((a, b) => a - b);
  return { pieces, ended, median: heights[Math.floor(heights.length / 2)], top: heights[heights.length - 1] };
}

describe("confetti", () => {
  const laptop: Stage = { width: 1440, height: 800 };
  const phone: Stage = { width: 390, height: 700 };
  const tv: Stage = { width: 1920, height: 1080 };

  it("scales the count and the paper size with the stage, within bounds", () => {
    expect(pieceCount(phone)).toBe(40);
    expect(pieceCount(laptop)).toBeGreaterThan(pieceCount(phone));
    expect(pieceCount(tv)).toBe(120);
    expect(pieceUnit(phone)).toBeLessThan(pieceUnit(tv));
    expect(pieceUnit(tv)).toBeLessThanOrEqual(9);
  });

  it("fires from both corners, small pieces, none the same", () => {
    const pieces = spawnBurst(laptop, seeded());
    const left = pieces.filter((p) => p.x < 0);
    const right = pieces.filter((p) => p.x > laptop.width);
    expect(left.length + right.length).toBe(pieces.length);
    expect(Math.abs(left.length - right.length)).toBeLessThanOrEqual(1);
    expect(left.every((p) => p.vx > 0 && p.vy < 0)).toBe(true);
    expect(right.every((p) => p.vx < 0 && p.vy < 0)).toBe(true);
    expect(Math.max(...pieces.map((p) => p.w * 2))).toBeLessThan(14);
    expect(new Set(pieces.map((p) => `${p.vx}|${p.vy}|${p.rotV}`)).size).toBe(pieces.length);
  });

  it.each([
    ["phone", phone],
    ["laptop", laptop],
    ["tv", tv],
  ])("fills the stage and drifts down over the whole show on a %s", (_, stage) => {
    const { ended, median, top } = simulate(stage);
    expect(median).toBeGreaterThan(0.45);
    expect(median).toBeLessThan(0.75);
    expect(top).toBeGreaterThan(0.85);
    // Gone before the cheer hands over (components/host/stageTiming.ts), but not in a dump.
    expect(ended).toBeGreaterThan(BURST_SECONDS - 1);
    expect(ended).toBeLessThanOrEqual(BURST_SECONDS);
  });

  it("eases into terminal velocity and sheds sideways speed as it falls", () => {
    const pieces = spawnBurst(laptop, seeded());
    const dt = 1 / 60;
    const launchVx = pieces.map((p) => Math.abs(p.vx));
    let settled = 0;
    for (let t = 0; t < 3; t += dt) {
      stepPieces(pieces, dt, t, laptop);
      for (const p of pieces) {
        if (!p.alive) continue;
        expect(p.vy).toBeLessThanOrEqual(p.terminal * 1.01);
        if (p.vy > p.terminal * 0.85) settled++;
      }
    }
    expect(settled).toBeGreaterThan(0);
    pieces.forEach((p, i) => {
      if (p.alive && p.vy > p.terminal * 0.9) expect(Math.abs(p.vx)).toBeLessThan(launchVx[i] * 0.3);
    });
  });

  it("cuts the paper from the room's accents", () => {
    expect(parseColor("#ff2d78")).toEqual([255, 45, 120]);
    expect(parseColor("#abc")).toEqual([170, 187, 204]);
    expect(parseColor(" rgb(215, 218, 226) ")).toEqual([215, 218, 226]);
    expect(parseColor("var(--nope)")).toBeNull();
    const minimal = paletteFrom("#aab0c0", "#d7dae2");
    expect(minimal).toEqual([
      "rgb(170, 176, 192)",
      "rgb(215, 218, 226)",
      "rgb(204, 208, 217)",
      "rgb(231, 233, 238)",
      "rgb(255, 255, 255)",
    ]);
    expect(paletteFrom("", "#00f0ff")[0]).toBe("rgb(255, 45, 120)");
    const pieces = spawnBurst(laptop, seeded(), minimal);
    expect(pieces.every((p) => minimal.includes(p.color))).toBe(true);
  });

  it("holds pieces in the barrel until their turn, then fades them out", () => {
    const pieces = spawnBurst(laptop, seeded());
    const late = pieces.reduce((a, b) => (a.born > b.born ? a : b));
    const before = { ...late };
    stepPieces(pieces, 1 / 60, 0, laptop);
    expect(late.x).toBe(before.x);
    expect(late.y).toBe(before.y);
    expect(late.age).toBe(0);
    const p = { ...late, alive: true, age: late.life, terminal: 0, vy: 0, vx: 0, swayAmp: 0 };
    let alive = 1;
    for (let t = 0; alive > 0 && t < 3; t += 1 / 60) alive = stepPieces([p], 1 / 60, 10, laptop);
    expect(p.alpha).toBe(0);
    expect(p.alive).toBe(false);
  });

  it("shades the back of the paper darker", () => {
    expect(backColor("#ffffff")).toBe("rgb(158, 158, 158)");
    expect(backColor("rgb(255, 45, 120)")).toBe("rgb(158, 28, 74)");
  });
});
