import { urlFor } from './url.mjs';
import { withDemoHeader } from './demoHeader.mjs';

const GUIDE_SLUG = 'how-to-host-karaoke-at-home';

function record(steps, name, ok, extra) {
  steps[name] = { ok, ...(extra || {}) };
  console.log(`[smoke] ${name}: ${ok ? 'PASS' : 'FAIL'}${extra?.note ? ' - ' + extra.note : ''}`);
}

export async function runReadonly({ baseUrl, browser }) {
  const steps = {};
  const context = await withDemoHeader(await browser.newContext(), baseUrl);

  for (const [name, path] of [
    ['get-home', '/'],
    ['get-songs', '/songs'],
    ['get-guide', `/guide/${GUIDE_SLUG}`],
  ]) {
    try {
      const resp = await context.request.get(urlFor(baseUrl, path), { timeout: 20000 });
      record(steps, name, resp.status() === 200, { status: resp.status() });
    } catch (e) {
      record(steps, name, false, { error: String(e).slice(0, 300) });
    }
  }

  try {
    const resp = await context.request.get(urlFor(baseUrl, '/api/health'), { timeout: 10000 });
    const body = await resp.json().catch(() => ({}));
    record(steps, 'get-health', resp.status() === 200 && body.db === 'ok', { status: resp.status(), body });
  } catch (e) {
    record(steps, 'get-health', false, { error: String(e).slice(0, 300) });
  }

  try {
    const page = await context.newPage();
    await page.goto(urlFor(baseUrl, '/sing/ZZZZZ'), { waitUntil: 'load', timeout: 20000 });
    await page.waitForTimeout(1000);
    const bodyText = await page.locator('body').innerText();
    const hasNotFound = /room not found/i.test(bodyText);
    const hasGoHome = /go home/i.test(bodyText);
    record(steps, 'sing-not-found-card', hasNotFound && hasGoHome, { hasNotFound, hasGoHome });
    await page.close();
  } catch (e) {
    record(steps, 'sing-not-found-card', false, { error: String(e).slice(0, 300) });
  }

  await context.close();

  const ok = Object.values(steps).every((s) => s.ok);
  return { ok, steps };
}
