import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";

const ROOT = join(__dirname, "../..");
const PORT = Number(process.env.TV_TEST_PORT ?? 3199);
export const BASE = `http://127.0.0.1:${PORT}`;

/**
 * Real User-Agents out of analytics_sessions, not synthesised ones. Tizen leads
 * because it is the set that showed the black-box hero.
 */
export const TV_AGENTS = {
  tizen:
    "Mozilla/5.0 (SMART-TV; Linux; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/5.0 Chrome/108.0.5359.1 TV Safari/537.36",
  netcast:
    "Mozilla/5.0 (Linux; NetCast; U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.6834.207 Safari/537.36 SmartTV/10.0 Colt/2.0",
  androidTv:
    "Mozilla/5.0 (Linux; Android 14; Smart TV Pro Build/UTT2.250416.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/136.0.7103.60 Mobile Safari/537.36",
};

export const DESKTOP_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

let server: ChildProcess | null = null;
let browser: Browser | null = null;

async function waitForServer(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`server did not answer on ${BASE} within ${timeoutMs}ms`);
}

export async function startHarness() {
  if (!existsSync(join(ROOT, ".next/BUILD_ID"))) {
    throw new Error("no production build found — run `pnpm build` before `pnpm test:tv`");
  }
  // The production bundle, because that is what a TV is served: the dev bundle
  // orders CSS differently and isn't minified. Its own process group, because
  // `npx` doesn't forward signals to the `next start` it spawns — killing the
  // wrapper alone leaves the port bound and the next run tests a stale build.
  server = spawn("npx", ["next", "start", "-p", String(PORT)], {
    cwd: ROOT,
    stdio: "ignore",
    detached: true,
  });
  await waitForServer();
  // playwright-core never downloads browsers, so a clean checkout has none.
  try {
    browser = await chromium.launch();
  } catch (err) {
    throw new Error(
      `could not launch Chromium — run \`npx playwright install chromium\` (${(err as Error).message})`
    );
  }
  return { browser };
}

export async function stopHarness() {
  await browser?.close();
  browser = null;
  if (server?.pid) {
    const exited = once(server, "exit");
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
    await exited;
  }
  server = null;
}

/**
 * 1920x1080 at DPR 1 is what every set in the data reports. The CPU throttle
 * stands in for a TV SoC: without it a MacBook renders anything smoothly and
 * the test proves nothing about the device it is named after.
 */
export async function tvPage(
  userAgent: string,
  { cpuThrottle = 6 }: { cpuThrottle?: number } = {}
): Promise<{ page: Page; errors: string[]; close: () => Promise<void> }> {
  if (!browser) throw new Error("harness not started");
  const context = await browser.newContext({
    userAgent,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  // Vercel injects /_vercel/insights/script.js at deploy time, so `next start`
  // 404s it locally — on desktop too, which is how we know it isn't a TV fault.
  const IGNORED = [
    /_vercel\/insights/,
    // Chromium's console line for a failed subresource carries no URL to match
    // on; the `requestfailed` handler below reports the same ones with one.
    /^console: Failed to load resource/,
  ];
  const errors: string[] = [];
  const note = (msg: string) => {
    if (!IGNORED.some((r) => r.test(msg))) errors.push(msg);
  };
  page.on("pageerror", (e) => note(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") note(`console: ${m.text()}`);
  });
  page.on("requestfailed", (r) => note(`requestfailed: ${r.url()}`));
  page.on("response", (r) => {
    if (r.status() >= 400) note(`http ${r.status()}: ${r.url()}`);
  });

  if (cpuThrottle > 1) {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuThrottle });
  }
  return { page, errors, close: () => context.close() };
}

export async function seedRoom(): Promise<{ code: string; cleanup: () => Promise<void> }> {
  // Dev and karaoq.live share one Atlas database, so this is a row in the live
  // rooms collection — hence the demo header. Fixed rather than random because
  // an interrupted run leaves a row no TTL removes; the next run sweeps it.
  const code = "TVTEST1";
  const sweep = async () => {
    const { MongoClient } = await import("mongodb");
    const client = new MongoClient(process.env.MONGODB_URI as string);
    try {
      await client.connect();
      await client.db(process.env.MONGODB_DB).collection("rooms").deleteMany({ id: code });
    } finally {
      await client.close();
    }
  };
  await sweep();
  await fetch(`${BASE}/api/queue/${code}`, {
    method: "POST",
    headers: { "x-karaoq-demo": "1" },
  });
  return { code, cleanup: sweep };
}
