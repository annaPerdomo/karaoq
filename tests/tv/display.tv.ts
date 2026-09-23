import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tvScale } from "../../lib/tvScale";
import {
  BASE,
  DESKTOP_AGENT,
  TV_AGENTS,
  seedRoom,
  startHarness,
  stopHarness,
  tvPage,
} from "./harness";

const ENV_FILE = join(__dirname, "../../.env.local");
if (!existsSync(ENV_FILE)) {
  throw new Error(`pnpm test:tv needs ${ENV_FILE} for MONGODB_URI`);
}
for (const line of readFileSync(ENV_FILE, "utf8").split("\n")) {
  const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

let room: Awaited<ReturnType<typeof seedRoom>>;

beforeAll(async () => {
  await startHarness();
  room = await seedRoom();
}, 180_000);

afterAll(async () => {
  await room?.cleanup();
  await stopHarness();
});

const TV_VIEWPORTS = [
  { width: 960, height: 540 },
  { width: 1920, height: 1080 },
  { width: 3840, height: 2160 },
];

async function loadDisplay(viewport: { width: number; height: number }) {
  const { page, close } = await tvPage(TV_AGENTS.tizen, { viewport });
  await page.goto(`${BASE}/display/${room.code}`, { waitUntil: "load", timeout: 60_000 });
  // _document sets --tv-scale inline before hydration, but useTvScale's effect
  // re-derives and re-applies it, so assertions wait for the settled value.
  await page.waitForFunction(
    (expected) =>
      getComputedStyle(document.documentElement).getPropertyValue("--tv-scale").trim() === expected,
    String(tvScale(viewport.width, viewport.height)),
    { timeout: 15_000 }
  );
  return { page, close };
}

describe("display scales on a TV", () => {
  it.each(TV_VIEWPORTS)("flags data-tv and lays the sidebar out at %o", async (viewport) => {
    const { page, close } = await loadDisplay(viewport);
    try {
      expect(await page.locator("html").getAttribute("data-tv")).toBe("1");

      const sidebar = page.locator('[class*="sidebar_"]').first();
      await sidebar.waitFor({ timeout: 30_000 });
      const box = await sidebar.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y).toBeLessThan(viewport.height * 0.5);
      const atLeftEdge = Math.abs(box!.x) < 2;
      const atRightEdge = Math.abs(box!.x + box!.width - viewport.width) < 2;
      expect(atLeftEdge || atRightEdge).toBe(true);

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const innerWidth = await page.evaluate(() => window.innerWidth);
      expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
    } finally {
      await close();
    }
  });

  it("keeps the sidebar width proportional across TV sizes", async () => {
    const ratios: number[] = [];
    for (const viewport of TV_VIEWPORTS) {
      const { page, close } = await loadDisplay(viewport);
      try {
        const sidebar = page.locator('[class*="sidebar_"]').first();
        await sidebar.waitFor({ timeout: 30_000 });
        const box = await sidebar.boundingBox();
        ratios.push(box!.width / viewport.width);
      } finally {
        await close();
      }
    }
    const [r0, r1, r2] = ratios;
    expect(Math.abs(r1 - r0) / r0).toBeLessThan(0.02);
    expect(Math.abs(r2 - r0) / r0).toBeLessThan(0.02);
  });

  it("keeps the QR proportional and visible across TV sizes", async () => {
    const ratios: number[] = [];
    for (const viewport of TV_VIEWPORTS) {
      const { page, close } = await loadDisplay(viewport);
      try {
        const qr = page.locator('[class*="sidebar_"] svg').first();
        await qr.waitFor({ timeout: 30_000 });
        expect(await qr.isVisible()).toBe(true);
        const box = await qr.boundingBox();
        expect(box).not.toBeNull();
        ratios.push(box!.width / viewport.width);
      } finally {
        await close();
      }
    }
    const [r0, r1, r2] = ratios;
    expect(Math.abs(r1 - r0) / r0).toBeLessThan(0.02);
    expect(Math.abs(r2 - r0) / r0).toBeLessThan(0.02);
  });

  it("keeps rem-based text proportional across TV sizes", async () => {
    const ratios: number[] = [];
    for (const viewport of TV_VIEWPORTS) {
      const { page, close } = await loadDisplay(viewport);
      try {
        const brand = page.locator('[class*="brand_"]').first();
        await brand.waitFor({ timeout: 30_000 });
        const fontSize = await brand.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
        ratios.push(fontSize / viewport.width);
      } finally {
        await close();
      }
    }
    const [r0, r1, r2] = ratios;
    expect(Math.abs(r1 - r0) / r0).toBeLessThan(0.03);
    expect(Math.abs(r2 - r0) / r0).toBeLessThan(0.03);
  });

  it("leaves desktop at its unscaled sidebar width and root font size", async () => {
    const { page, close } = await tvPage(DESKTOP_AGENT, {
      cpuThrottle: 1,
      viewport: { width: 1920, height: 1080 },
    });
    try {
      await page.goto(`${BASE}/display/${room.code}`, { waitUntil: "load", timeout: 60_000 });
      expect(await page.locator("html").getAttribute("data-tv")).toBeNull();
      expect(await page.locator("html").getAttribute("data-tv-scaled")).toBeNull();
      const rootFontSize = await page.evaluate(
        () => parseFloat(getComputedStyle(document.documentElement).fontSize)
      );
      expect(rootFontSize).toBe(16);
      const sidebar = page.locator('[class*="sidebar_"]').first();
      await sidebar.waitFor({ timeout: 30_000 });
      const box = await sidebar.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(279);
      expect(box!.width).toBeLessThanOrEqual(281);
    } finally {
      await close();
    }
  });
});
