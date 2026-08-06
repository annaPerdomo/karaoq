import { describe, it, expect } from "vitest";
import { GRID, WORLD_DOTS_RLE, SHARED_DOTS } from "../../lib/home/worldDots";
import { decodeWorld } from "../../components/home/WorldDotMap";

// The map data is generated (scripts/gen-world-dots.mjs), so these guard the
// encoding contract the component decodes against — a regenerated grid that
// broke it would otherwise only show up as a blank map in production.
function decode(): (string | null)[] {
  const cells: (string | null)[] = [];
  for (const run of WORLD_DOTS_RLE.split(",")) {
    const isSea = run[0] === "-";
    const code = isSea ? null : run.slice(0, 2);
    const length = Number(isSea ? run.slice(1) : run.slice(2));
    for (let i = 0; i < length; i++) cells.push(code);
  }
  return cells;
}

describe("worldDots", () => {
  const cells = decode();

  it("decodes to exactly one entry per grid cell", () => {
    expect(cells).toHaveLength(GRID.cols * GRID.rows);
  });

  it("encodes every run with a positive length", () => {
    for (const run of WORLD_DOTS_RLE.split(",")) {
      const isSea = run[0] === "-";
      expect(Number(isSea ? run.slice(1) : run.slice(2))).toBeGreaterThan(0);
    }
  });

  it("uses two-letter uppercase country codes for land", () => {
    const codes = new Set(cells.filter(Boolean) as string[]);
    for (const code of codes) expect(code).toMatch(/^[A-Z]{2}$/);
  });

  it("is mostly sea, as a world map should be", () => {
    const land = cells.filter(Boolean).length;
    expect(land).toBeGreaterThan(0);
    expect(land / cells.length).toBeLessThan(0.5);
  });

  it("places the countries the landing page is most likely to light", () => {
    const codes = new Set(cells.filter(Boolean) as string[]);
    // Top international traffic (see the intl-suggestions work) plus the
    // microstates that only exist via SHARED_DOTS.
    for (const code of ["US", "DE", "PH", "ID", "CZ", "JP", "KR", "BR", "FR", "ES"]) {
      expect(codes.has(code)).toBe(true);
    }
    for (const code of ["SG", "MT"]) {
      expect(codes.has(code) || code in SHARED_DOTS).toBe(true);
    }
  });

  it("points every shared dot at a real land cell", () => {
    for (const [code, cellIndex] of Object.entries(SHARED_DOTS)) {
      expect(code).toMatch(/^[A-Z]{2}$/);
      expect(cells[cellIndex]).toBeTruthy();
    }
  });
});

// decodeWorld() is what WorldDotMap actually renders from — a bug in its
// cell-index math or the SHARED_DOTS merge would only otherwise show up as a
// wrong dot on the live map, so it's exercised directly here.
describe("decodeWorld", () => {
  const world = decodeWorld();
  const rleCells = decode();

  it("produces one land dot per land cell in the RLE", () => {
    const landCells = rleCells.filter(Boolean).length;
    expect(world.land).toHaveLength(landCells);
  });

  it("places each dot at the center of its grid cell", () => {
    for (const dot of world.land) {
      expect(dot.x % 1).toBeCloseTo(0.5);
      expect(dot.y % 1).toBeCloseTo(0.5);
      expect(dot.x).toBeGreaterThanOrEqual(0);
      expect(dot.x).toBeLessThanOrEqual(GRID.cols);
      expect(dot.y).toBeGreaterThanOrEqual(0);
      expect(dot.y).toBeLessThanOrEqual(GRID.rows);
    }
  });

  it("maps every country's land indices back to that country's own cells", () => {
    for (const [code, indices] of world.byCountry) {
      // Skip codes that exist only via SHARED_DOTS (they own no cell of
      // their own, so they won't appear in the raw RLE decode).
      if (!rleCells.includes(code)) continue;
      for (const index of indices) {
        const dot = world.land[index];
        const cell = Math.floor(dot.y) * GRID.cols + Math.floor(dot.x);
        expect(rleCells[cell]).toBe(code);
      }
    }
  });

  it("gives every SHARED_DOTS microstate a dot borrowed from its host cell", () => {
    for (const [code, cellIndex] of Object.entries(SHARED_DOTS)) {
      const indices = world.byCountry.get(code);
      expect(indices).toBeDefined();
      expect(indices!.length).toBeGreaterThan(0);
      const hostCode = rleCells[cellIndex];
      const dot = world.land[indices![0]];
      const dotCell = Math.floor(dot.y) * GRID.cols + Math.floor(dot.x);
      expect(dotCell).toBe(cellIndex);
      // The borrowed dot is still tagged as belonging to the host country too.
      expect(world.byCountry.get(hostCode!)).toContain(indices![0]);
    }
  });

  it("is memoized across calls", () => {
    expect(decodeWorld()).toBe(world);
  });
});
