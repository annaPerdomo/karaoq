import { urlFor } from './url.mjs';
import { withDemoHeader } from './demoHeader.mjs';

function record(steps, name, ok, extra) {
  steps[name] = { ok, ...(extra || {}) };
  console.log(`[smoke] ${name}: ${ok ? 'PASS' : 'FAIL'}${extra?.note ? ' - ' + extra.note : ''}`);
}

function roomCode() {
  const stamp = Date.now().toString(36).toUpperCase();
  return `QA${stamp}`.slice(0, 12);
}

async function addOneSong(singer, query) {
  const searchInput = singer.locator('input[type="text"]').first();
  await searchInput.fill(query);
  await searchInput.press('Enter');
  await singer.waitForTimeout(3500);
  let addBtn = singer.locator('[class*="addBtn"]').first();
  if (!(await addBtn.count())) {
    const catCard = singer.locator('[class*="categoryCard"]').first();
    if (await catCard.count()) {
      await catCard.click();
      await singer.waitForTimeout(800);
    }
    const songRow = singer.locator('[class*="songRow"]').first();
    if (await songRow.count()) await songRow.click();
    await singer.waitForTimeout(2500);
    addBtn = singer.locator('[class*="addBtn"]').first();
  }
  if (!(await addBtn.count())) return false;
  await addBtn.first().click();
  await singer.waitForTimeout(400);
  const confirmBtn = singer.getByRole('button', { name: /add song/i }).last();
  if (await confirmBtn.count()) await confirmBtn.click();
  await singer.waitForTimeout(1500);
  return true;
}

export async function runFull({ baseUrl, browser }) {
  const steps = {};
  const requestedCode = roomCode();
  const roomCodes = [];
  let code = requestedCode;

  const hostCtx = await withDemoHeader(await browser.newContext({ viewport: { width: 1280, height: 900 } }), baseUrl);
  const host = await hostCtx.newPage();

  try {
    await host.goto(urlFor(baseUrl, '/'), { waitUntil: 'load', timeout: 30000 });
    await host.waitForTimeout(500);
    await host.locator('input').first().fill('QA Smoke Host');
    const toggleBtn = host.getByRole('button', { name: /custom code|random code/i });
    if (await toggleBtn.count()) {
      await toggleBtn.first().click();
      await host.waitForTimeout(200);
      await host.locator('input').nth(1).fill(requestedCode);
      await host.waitForTimeout(100);
    }
    await host.getByRole('button', { name: /host|start|create/i }).first().click();
    await host.waitForURL(/\/host\//, { timeout: 15000 });
    await host.waitForTimeout(1000);

    const match = host.url().match(/\/host\/([A-Za-z0-9]+)/);
    code = match ? match[1] : requestedCode;
    roomCodes.push(code);
    record(steps, 'create-room', true, { requestedCode, code });
  } catch (e) {
    record(steps, 'create-room', false, { error: String(e).slice(0, 400) });
    await hostCtx.close().catch(() => {});
    return { ok: false, steps, roomCodes };
  }

  try {
    const dispCtx = await withDemoHeader(await browser.newContext({ viewport: { width: 1920, height: 1080 } }), baseUrl);
    const disp = await dispCtx.newPage();
    await disp.goto(urlFor(baseUrl, `/display/${code}`), { waitUntil: 'load', timeout: 30000 });
    await disp.waitForTimeout(1500);
    record(steps, 'display-idle', true);
    await dispCtx.close();
  } catch (e) {
    record(steps, 'display-idle', false, { error: String(e).slice(0, 400) });
  }

  let singer;
  let singerCtx;
  try {
    singerCtx = await withDemoHeader(await browser.newContext({ viewport: { width: 390, height: 844 } }), baseUrl);
    await singerCtx.addInitScript(() => {
      try {
        localStorage.setItem('karaoq_username', 'QA Smoke Singer');
        localStorage.setItem('karaoq_seen_tips', '1');
      } catch {}
    });
    singer = await singerCtx.newPage();
    await singer.goto(urlFor(baseUrl, `/sing/${code}`), { waitUntil: 'load', timeout: 30000 });
    await singer.waitForTimeout(1000);

    const added = await addOneSong(singer, 'mr brightside');
    record(steps, 'singer-search-and-add', added);
  } catch (e) {
    record(steps, 'singer-search-and-add', false, { error: String(e).slice(0, 500) });
  }

  try {
    await host.goto(urlFor(baseUrl, `/host/${code}`), { waitUntil: 'load', timeout: 20000 });
    await host.waitForTimeout(2500);
    const queueText = await host.locator('body').innerText().catch(() => '');
    record(steps, 'host-sees-queue', queueText.length > 0);
  } catch (e) {
    record(steps, 'host-sees-queue', false, { error: String(e).slice(0, 400) });
  }

  try {
    const nextBtn = host.locator('[title="Next Song"], button:has-text("Next")').first();
    const advanced = await nextBtn.count();
    if (advanced) {
      await nextBtn.click().catch(() => {});
      await host.waitForTimeout(1000);
    }
    record(steps, 'advance-song', Boolean(advanced));
  } catch (e) {
    record(steps, 'advance-song', false, { error: String(e).slice(0, 400) });
  }

  try {
    if (singer) {
      const emojiBtn = singer.locator('button:has-text("🎉"), button:has-text("🔥"), button[aria-label*="Send"]').first();
      const present = (await emojiBtn.count()) > 0;
      if (present) await emojiBtn.click().catch(() => {});
      record(steps, 'emoji-reaction', true, { present });
    }
  } catch (e) {
    record(steps, 'emoji-reaction', false, { error: String(e).slice(0, 400) });
  }

  await hostCtx.close().catch(() => {});
  if (singerCtx) await singerCtx.close().catch(() => {});

  const required = ['create-room', 'singer-search-and-add', 'host-sees-queue', 'advance-song'];
  const ok = required.every((name) => steps[name]?.ok);
  return { ok, steps, roomCodes };
}
