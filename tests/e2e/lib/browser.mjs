import { createRequire } from 'module';

const req = createRequire(import.meta.url);

export async function launchBrowser() {
  const { chromium } = req('playwright-core');
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || chromium.executablePath();
  return chromium.launch({ executablePath, headless: true });
}
