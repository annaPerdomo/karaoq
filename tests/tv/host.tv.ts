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

const ENV_FILE = join(__dirname, "../../.env.local");
if (!existsSync(ENV_FILE)) {
  throw new Error(`pnpm test:tv needs ${ENV_FILE} for MONGODB_URI`);
}
for (const line of readFileSync(ENV_FILE, "utf8").split("\n")) {
  const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

let room: Awaited<ReturnType<typeof seedRoom>>;

/** Six queued songs plus an active auto-start countdown, set directly in
 * Mongo the way `seedRoom`'s own sweep does — no API route mints these fields. */
async function seedQueueAndCountdown(code: string) {
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(process.env.MONGODB_URI as string);
  try {
    await client.connect();
    const queue = Array.from({ length: 6 }, (_, i) => ({
      id: `tv-song-${i}`,
      userName: `Singer ${i + 1}`,
      songTitle: `Test Song ${i + 1}`,
      videoId: "dQw4w9WgXcQ",
      durationSeconds: 180,
      addedAt: Date.now() + i,
    }));
    await client
      .db(process.env.MONGODB_DB)
      .collection("rooms")
      .updateOne(
        { id: code },
        {
          $set: {
            queue,
            activeVideoIndex: 0,
            isPlaying: false,
            // Far enough out that no test in this file's run sees the room auto-start.
            autoStartAt: new Date(Date.now() + 30 * 60_000),
            autoAdvance: { enabled: true, gapSeconds: 60 },
          },
        }
      );
  } finally {
    await client.close();
  }
}

beforeAll(async () => {
  await startHarness();
  room = await seedRoom();
  await seedQueueAndCountdown(room.code);
}, 180_000);

afterAll(async () => {
  await room?.cleanup();
  await stopHarness();
});

const TV_VIEWPORTS = [
  { width: 960, height: 540 },
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
];

async function loadHost(
  viewport: { width: number; height: number },
  userAgent = TV_AGENTS.tizen
) {
  const { page, close } = await tvPage(userAgent, {
    viewport,
    roomKey: { code: room.code, key: room.roomKey, role: "host" },
  });
  await page.goto(`${BASE}/host/${room.code}`, { waitUntil: "load", timeout: 60_000 });
  const ring = page.locator('[role="timer"]').first();
  await ring.waitFor({ timeout: 30_000 });
  return { page, close };
}

describe("host page fits a TV", () => {
  it.each(TV_VIEWPORTS)(
    "keeps the countdown ring clear of the header and the transport bar at %o",
    async (viewport) => {
      const { page, close } = await loadHost(viewport);
      try {
        const ringBox = (await page.locator('[role="timer"]').first().boundingBox())!;
        const headerBox = (await page.locator('[class*="header_"]').first().boundingBox())!;
        const transportBox = (await page.locator('[class*="transportMain_"]').first().boundingBox())!;
        expect(ringBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height - 1);
        expect(ringBox.y + ringBox.height).toBeLessThanOrEqual(transportBox.y + 1);
      } finally {
        await close();
      }
    }
  );

  it.each([{ width: 960, height: 540 }, { width: 1280, height: 720 }])(
    "shows at least 4 full queue rows in the visible list at %o",
    async (viewport) => {
      const { page, close } = await loadHost(viewport);
      try {
        const list = page.locator('[class*="queueList_"]').first();
        await list.waitFor({ timeout: 30_000 });
        const listBox = (await list.boundingBox())!;
        const rows = page.locator('[class*="queueItem_"]');
        await rows.first().waitFor({ timeout: 15_000 });
        const count = await rows.count();
        let visible = 0;
        for (let i = 0; i < count; i++) {
          const box = await rows.nth(i).boundingBox();
          if (box && box.y >= listBox.y - 1 && box.y + box.height <= listBox.y + listBox.height + 1) {
            visible++;
          }
        }
        expect(visible).toBeGreaterThanOrEqual(4);
      } finally {
        await close();
      }
    }
  );

  it.each(TV_VIEWPORTS)(
    "has no horizontal overflow and shows the full transport bar at %o",
    async (viewport) => {
      const { page, close } = await loadHost(viewport);
      try {
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const innerWidth = await page.evaluate(() => window.innerWidth);
        expect(scrollWidth).toBeLessThanOrEqual(innerWidth);

        const transportBox = (await page.locator('[class*="transport_"]').first().boundingBox())!;
        expect(transportBox.y).toBeGreaterThanOrEqual(0);
        expect(transportBox.y + transportBox.height).toBeLessThanOrEqual(viewport.height + 1);
      } finally {
        await close();
      }
    }
  );

  it("leaves desktop's row height and ring size at their pre-change baseline", async () => {
    const { page, close } = await tvPage(DESKTOP_AGENT, {
      cpuThrottle: 1,
      viewport: { width: 1440, height: 900 },
      roomKey: { code: room.code, key: room.roomKey, role: "host" },
    });
    try {
      await page.goto(`${BASE}/host/${room.code}`, { waitUntil: "load", timeout: 60_000 });
      expect(await page.locator("html").getAttribute("data-tv")).toBeNull();

      // Baseline from styles/Countdown.module.css `.stageCount .ring { --ring-size: 150px }`,
      // untouched by any TV rule since those are all scoped to html[data-tv].
      const ring = page.locator('[role="timer"]').first();
      await ring.waitFor({ timeout: 30_000 });
      const ringBox = (await ring.boundingBox())!;
      expect(ringBox.width).toBeCloseTo(150, 0);
      expect(ringBox.height).toBeCloseTo(150, 0);

      // Baseline from styles/Host.module.css `.queueItem` (padding: 0.6rem 0.75rem 0.6rem 0.5rem,
      // untouched by the html[data-tv] rules): measured at 70.15625px on this build.
      const row = page.locator('[class*="queueItem_"]').first();
      await row.waitFor({ timeout: 30_000 });
      const rowHeight = await row.evaluate((el) => el.getBoundingClientRect().height);
      expect(Math.abs(rowHeight - 70.16)).toBeLessThan(0.5);
    } finally {
      await close();
    }
  });
});
