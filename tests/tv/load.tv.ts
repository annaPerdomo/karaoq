import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BASE,
  DESKTOP_AGENT,
  TV_AGENTS,
  seedRoom,
  startHarness,
  stopHarness,
  tvPage,
} from "./harness";

// The harness needs MONGODB_URI to sweep its seeded room. Resolved from this
// file, not the cwd, which vitest does not promise.
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

describe.each(Object.entries(TV_AGENTS))("landing page on %s", (_name, ua) => {
  it("loads, paints the hero, and reports no errors", async () => {
    const { page, errors, close } = await tvPage(ua);
    try {
      await page.goto(BASE, { waitUntil: "load", timeout: 60_000 });
      await expect
        .poll(() => page.locator("h1").first().isVisible(), { timeout: 30_000 })
        .toBe(true);
      expect(await page.getByRole("button", { name: /start a room/i }).isVisible()).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      await close();
    }
  });

  it("is flagged as a TV before first paint", async () => {
    const { page, close } = await tvPage(ua);
    try {
      await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60_000 });
      expect(await page.locator("html").getAttribute("data-tv")).toBe("1");
    } finally {
      await close();
    }
  });

  // The regression in Anna's photo: Tizen drops the VP9 alpha plane and the
  // hero paints an opaque black rectangle over the gradient.
  it("shows the poster instead of the alpha film", async () => {
    const { page, close } = await tvPage(ua);
    try {
      await page.goto(BASE, { waitUntil: "load", timeout: 60_000 });
      expect(await page.locator("video").count()).toBe(0);
      expect(await page.locator('img[src*="hero-demo-poster"]').count()).toBeGreaterThan(0);
    } finally {
      await close();
    }
  });

  it("runs no infinite animations in the hero", async () => {
    const { page, close } = await tvPage(ua);
    try {
      await page.goto(BASE, { waitUntil: "load", timeout: 60_000 });
      const running = await page.evaluate(() =>
        document
          .getAnimations()
          .filter((a) => {
            const timing = a.effect?.getTiming();
            return timing?.iterations === Infinity && a.playState === "running";
          })
          .map((a) => (a.effect as KeyframeEffect)?.target?.className ?? "?")
      );
      expect(running).toEqual([]);
    } finally {
      await close();
    }
  });
});

describe("host screen on a TV", () => {
  it("loads the room without errors", async () => {
    const { page, errors, close } = await tvPage(TV_AGENTS.tizen);
    try {
      await page.goto(`${BASE}/host/${room.code}`, { waitUntil: "load", timeout: 60_000 });
      // If the join code rendered, the room resolved and the screen is usable.
      await expect
        .poll(() => page.getByText(room.code, { exact: false }).first().isVisible(), {
          timeout: 30_000,
        })
        .toBe(true);
      expect(errors).toEqual([]);
    } finally {
      await close();
    }
  });
});

// Without this, breaking the site for everyone would still pass the TV tests.
describe("desktop is unaffected", () => {
  it("still gets the film and is not flagged as a TV", async () => {
    const { page, close } = await tvPage(DESKTOP_AGENT, { cpuThrottle: 1 });
    try {
      await page.goto(BASE, { waitUntil: "load", timeout: 60_000 });
      expect(await page.locator("html").getAttribute("data-tv")).toBeNull();
      await expect.poll(() => page.locator("video").count(), { timeout: 20_000 }).toBe(1);
    } finally {
      await close();
    }
  });

  it("still runs its hero animations", async () => {
    const { page, close } = await tvPage(DESKTOP_AGENT, { cpuThrottle: 1 });
    try {
      await page.goto(BASE, { waitUntil: "load", timeout: 60_000 });
      const infinite = await page.evaluate(
        () =>
          document.getAnimations().filter((a) => a.effect?.getTiming().iterations === Infinity)
            .length
      );
      expect(infinite).toBeGreaterThan(0);
    } finally {
      await close();
    }
  });
});
