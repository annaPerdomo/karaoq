import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  bandDelay,
  BAND_COUNT,
  buildBands,
  decodeWorld,
  LIT_DURATION_MS,
  LIT_LAG_MS,
  SPARKLE_COUNT,
  SPARKLE_CYCLE_MIN_MS,
  SPARKLE_SPREAD_MS,
  sparklePath,
  sparkleStart,
} from "../../lib/home/worldMapAnim";

// A country left dark looks like a quiet map rather than a bug, so where the
// sparkles land has to be asserted directly.

const world = decodeWorld();

/** The `x,y` keys of every dot a country owns. */
const dotsOf = (code: string): Set<string> =>
  new Set(world.byCountry.get(code)!.map((i) => `${world.land[i].x},${world.land[i].y}`));

/** How many of `codes`' sparkles landed on `code`. */
const owned = (codes: string[], code: string): number => {
  const keys = dotsOf(code);
  return buildBands(codes).sparkles.filter((s) => keys.has(`${s.x},${s.y}`)).length;
};

describe("buildBands sparkles", () => {
  const LIVE = ["US", "MX", "DE", "PH", "ES", "MT", "CA", "AU", "SG", "TW", "KR", "NL", "CH", "HR"];

  it("puts a sparkle on every country, not just the ones with room for one", () => {
    const at = new Set(buildBands(LIVE).sparkles.map((s) => `${s.x},${s.y}`));
    for (const code of LIVE) {
      expect([...dotsOf(code)].some((k) => at.has(k)), `${code} has no sparkle`).toBe(true);
    }
  });

  it("scatters the extras across a big country instead of leaving it to one", () => {
    const codes = ["US", "MT", "SG", "CA"];
    expect(owned(codes, "MT")).toBe(1);
    expect(owned(codes, "SG")).toBe(1);
    expect(owned(codes, "US")).toBeGreaterThan(5);
    // Canada has ~1.5x the dots of the US and should carry proportionally more.
    expect(owned(codes, "CA")).toBeGreaterThan(owned(codes, "US"));
  });

  it("spreads a country's sparkles over its landmass, not into one corner", () => {
    const sparkles = buildBands(["CA"]).sparkles;
    const xs = sparkles.map((s) => s.x);
    const ys = sparkles.map((s) => s.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(20);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(5);
  });

  it("spends nothing on a country that was never lit", () => {
    const usDots = dotsOf("US");
    for (const s of buildBands(["US"]).sparkles) {
      expect(usDots.has(`${s.x},${s.y}`)).toBe(true);
    }
  });

  it("stays inside the budget however many countries are lit", () => {
    const codes = [...world.byCountry.keys()];
    expect(codes.length).toBeGreaterThan(SPARKLE_COUNT);
    expect(buildBands(codes).sparkles.length).toBeLessThanOrEqual(SPARKLE_COUNT);
  });

  it("gives the openers to the countries higher up the list", () => {
    // NZ is the probe because it owns its cells outright: a microstate would
    // read as sparkling here off the host it shares its one cell with.
    const shared = new Set<number>();
    for (const [code, indices] of world.byCountry) {
      if (code === "NZ") continue;
      for (const i of indices) shared.add(i);
    }
    expect(world.byCountry.get("NZ")!.every((i) => !shared.has(i))).toBe(true);

    const rest = [...world.byCountry.keys()].filter((c) => c !== "NZ");
    expect(rest.length).toBeGreaterThan(SPARKLE_COUNT);
    expect(owned(["NZ", ...rest], "NZ")).toBeGreaterThan(0);
    expect(owned([...rest, "NZ"], "NZ")).toBe(0);
  });

  it("never stacks two sparkles on one point", () => {
    // VA and SM share their host's cell; both placed would spend the budget twice.
    const keys = buildBands(["SA", "BH", "IT", "VA", "SM", "US"]).sparkles.map(
      (s) => `${s.x},${s.y}`
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("is stable across calls, so the scatter never re-rolls on a re-render", () => {
    expect(buildBands(LIVE).sparkles).toEqual(buildBands(LIVE).sparkles);
  });
});

describe("sparklePath", () => {
  it("draws four rays pinched to the centre", () => {
    const d = sparklePath({ x: 10, y: 20 }, 2);
    expect(d.startsWith("M10 18")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect(d.match(/C/g)).toHaveLength(4);
    for (const c of d.match(/C[\d.-]+ [\d.-]+ [\d.-]+ [\d.-]+/g)!) {
      expect(c).toBe("C10 20 10 20");
    }
    expect(d).toContain("12 20");
    expect(d).toContain("10 22");
    expect(d).toContain("8 20");
  });

  it("scales with the radius it is given", () => {
    expect(sparklePath({ x: 0, y: 0 }, 1)).not.toBe(sparklePath({ x: 0, y: 0 }, 2));
  });
});

describe("sparkle timing", () => {
  it("starts a sparkle off its own band, not the last one", () => {
    const west = sparkleStart({ x: 1.5, y: 10.5 });
    const east = sparkleStart({ x: 168.5, y: 10.5 });
    expect(west).toBeLessThan(east);
    // Longitude is all that decides it — the sweep is a function of x.
    expect(sparkleStart({ x: 1.5, y: 60.5 })).toBe(west);
  });

  it("never glints over a dot that is still arriving", () => {
    for (let band = 0; band < BAND_COUNT; band++) {
      const x = band * 3 + 0.5;
      expect(sparkleStart({ x, y: 10.5 })).toBeGreaterThanOrEqual(
        bandDelay(band) + LIT_LAG_MS + LIT_DURATION_MS
      );
    }
  });

  it("has the whole field going sooner than the old whole-map wait", () => {
    const oldWait = bandDelay(BAND_COUNT - 1) + LIT_LAG_MS + 1100;
    expect(sparkleStart({ x: 169.5, y: 10.5 })).toBeLessThan(oldWait);
  });

  it("scatters the starts wide enough that the field can't beat as one", () => {
    expect(SPARKLE_SPREAD_MS).toBeGreaterThanOrEqual(SPARKLE_CYCLE_MIN_MS * 0.8);
  });

  it("puts the glint at the front of the cycle", () => {
    // An idle head costs every sparkle that fraction of a multi-second cycle
    // before it first shows, however early its delay fires.
    const css = readFileSync(join(process.cwd(), "styles", "Home.module.css"), "utf8");
    const block = css.match(/@keyframes reachSparkle\s*\{[\s\S]*?\n\}/);
    expect(block).toBeTruthy();
    const peak = [...block![0].matchAll(/(\d+)%[^{]*\{[^}]*opacity:\s*([\d.]+)/g)]
      .map(([, pct, opacity]) => ({ pct: Number(pct), opacity: Number(opacity) }))
      .sort((a, b) => b.opacity - a.opacity)[0];
    expect(peak.opacity).toBeGreaterThan(0.5);
    expect(peak.pct).toBeLessThan(25);
  });
});
