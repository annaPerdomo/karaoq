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

async function loadDisplay(
  viewport: { width: number; height: number },
  roomKey?: { code: string; key: string }
) {
  const { page, close } = await tvPage(TV_AGENTS.tizen, { viewport, roomKey });
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

  it("moves focus with the remote and shows a visible outline", async () => {
    const { page, close } = await loadDisplay({ width: 1920, height: 1080 });
    try {
      await page.locator('[data-remote="customize"]').waitFor({ timeout: 30_000 });
      await page.keyboard.press("ArrowRight");
      const focused = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return el ? { tag: el.tagName, outline: getComputedStyle(el).outlineStyle } : null;
      });
      expect(focused?.tag).toBe("BUTTON");
      expect(focused?.outline).not.toBe("none");
    } finally {
      await close();
    }
  });

  it("lets a pointer remote hit the grip it aims at, not the Hide beside it", async () => {
    const { page, close } = await loadDisplay({ width: 1920, height: 1080 });
    try {
      await page.locator('[data-remote="customize"]').click({ timeout: 30_000 });
      const grips = page.locator('[class*="gripBtn"]');
      await grips.first().waitFor({ timeout: 15_000 });
      const before = await grips.count();

      const hits = await page.evaluate(() => {
        const grip = document.querySelector<HTMLElement>('[class*="gripBtn"]')!;
        const hide = Array.from(grip.parentElement!.querySelectorAll<HTMLElement>("button")).find((b) => b !== grip);
        const hitsItself = (el: HTMLElement) => {
          const r = el.getBoundingClientRect();
          const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return !!at && el.contains(at);
        };
        return { grip: hitsItself(grip), hide: hide ? hitsItself(hide) : null };
      });
      expect(hits.grip).toBe(true);
      expect(hits.hide).not.toBe(false);

      const box = (await grips.first().boundingBox())!;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      expect(await grips.count()).toBe(before);
    } finally {
      await close();
    }
  });

  it("keeps the side-flip pill clear of the rail", async () => {
    const { page, close } = await loadDisplay({ width: 1920, height: 1080 });
    try {
      await page.locator('[data-remote="customize"]').click({ timeout: 30_000 });

      const rail = page.locator('[class*="rail_"]').first();
      await rail.waitFor({ timeout: 15_000 });
      const railBox = (await rail.boundingBox())!;

      const railControl = page.locator('[class*="railCard_"], [class*="swatch_"]').first();
      await railControl.waitFor({ timeout: 15_000 });
      const controlBox = (await railControl.boundingBox())!;
      const hitsRail = await page.evaluate(
        ({ x, y }) => !!document.elementFromPoint(x, y)?.closest('[class*="rail_"]'),
        { x: controlBox.x + controlBox.width / 2, y: controlBox.y + controlBox.height / 2 }
      );
      expect(hitsRail).toBe(true);

      const pill = page.locator('[class*="sideFlipPill_"]');
      await pill.waitFor({ timeout: 15_000 });
      const pillBox = (await pill.boundingBox())!;
      const intersects =
        pillBox.x < railBox.x + railBox.width &&
        pillBox.x + pillBox.width > railBox.x &&
        pillBox.y < railBox.y + railBox.height &&
        pillBox.y + pillBox.height > railBox.y;
      expect(intersects).toBe(false);
    } finally {
      await close();
    }
  });

  it("moves a section two slots with two ArrowDown presses, keeping focus on it", async () => {
    const { page, close } = await loadDisplay({ width: 1920, height: 1080 });
    try {
      await page.locator('[data-remote="customize"]').click({ timeout: 30_000 });
      const grips = page.locator('[data-grip]');
      await grips.first().waitFor({ timeout: 15_000 });
      const firstId = await grips.first().getAttribute("data-grip");

      await grips.first().focus();
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");

      const ids = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-grip]")).map((el) => el.getAttribute("data-grip"))
      );
      expect(ids.indexOf(firstId)).toBe(2);

      const focusedId = await page.evaluate(() => document.activeElement?.getAttribute("data-grip"));
      expect(focusedId).toBe(firstId);
    } finally {
      await close();
    }
  });

  it("resizes the sidebar from the keyboard and saves it", async () => {
    const before = await (await fetch(`${BASE}/api/queue/${room.code}`)).json();
    const startWidth: number = before.displayConfig.sidebarWidth;

    const { page, close } = await loadDisplay(
      { width: 1920, height: 1080 },
      { code: room.code, key: room.roomKey }
    );
    try {
      const customizeBtn = page.locator('[data-remote="customize"]');
      await customizeBtn.waitFor({ timeout: 30_000 });
      await customizeBtn.focus();
      await page.keyboard.press("Enter");

      const sidebarSpot = page.locator('[role="button"]').first();
      await sidebarSpot.waitFor({ timeout: 15_000 });
      await sidebarSpot.focus();
      await page.keyboard.press("Enter");

      const widthHandle = page.locator('[class*="widthHandle"]').first();
      await widthHandle.waitFor({ timeout: 15_000 });
      await widthHandle.focus();
      // Default sidebar is right-anchored, which inverts the axis: Left widens it.
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowLeft");

      await page.locator('[data-remote="save"]').click({ timeout: 15_000 });

      let after = before;
      for (let i = 0; i < 20; i++) {
        after = await (await fetch(`${BASE}/api/queue/${room.code}`)).json();
        if (after.displayConfig.sidebarWidth === startWidth + 40) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      expect(after.displayConfig.sidebarWidth).toBe(startWidth + 40);
    } finally {
      await close();
    }
  });

  it("hides Connect a phone for a keyless viewer", async () => {
    const { page, close } = await loadDisplay({ width: 1920, height: 1080 });
    try {
      await page.locator('[data-remote="customize"]').waitFor({ timeout: 30_000 });
      expect(await page.locator('[data-remote="connect-phone"]').count()).toBe(0);
    } finally {
      await close();
    }
  });

  it("shows Connect a phone for the seeded host and reaches it with the remote", async () => {
    const { page, close } = await loadDisplay(
      { width: 1920, height: 1080 },
      { code: room.code, key: room.roomKey }
    );
    try {
      const button = page.locator('[data-remote="connect-phone"]');
      await button.waitFor({ timeout: 30_000 });
      await button.focus();
      const focused = await page.evaluate(() => document.activeElement?.getAttribute("data-remote"));
      expect(focused).toBe("connect-phone");
    } finally {
      await close();
    }
  });
});
