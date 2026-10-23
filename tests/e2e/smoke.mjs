import { isAllowedFullModeHost } from './lib/hostGuard.mjs';
import { launchBrowser } from './lib/browser.mjs';
import { runReadonly } from './lib/readonly.mjs';
import { runFull } from './lib/full.mjs';
import { cleanupRooms } from './lib/cleanup.mjs';

const BASE_URL = process.env.BASE_URL;
const SMOKE_MODE = process.env.SMOKE_MODE === 'full' ? 'full' : 'readonly';

if (!BASE_URL) {
  console.error('usage: BASE_URL=<url> [SMOKE_MODE=full|readonly] node tests/e2e/smoke.mjs');
  process.exit(1);
}

if (SMOKE_MODE === 'full' && !isAllowedFullModeHost(BASE_URL)) {
  console.error(`smoke: refusing to run SMOKE_MODE=full against ${BASE_URL} (host not on the allowlist)`);
  process.exit(1);
}

if (SMOKE_MODE === 'full' && (!process.env.MONGODB_DB || process.env.MONGODB_DB === 'karaoq')) {
  console.error('smoke: refusing to run SMOKE_MODE=full with MONGODB_DB unset or set to the production database');
  process.exit(1);
}

(async () => {
  const browser = await launchBrowser();
  let result;
  try {
    result = SMOKE_MODE === 'full' ? await runFull({ baseUrl: BASE_URL, browser }) : await runReadonly({ baseUrl: BASE_URL, browser });
  } finally {
    await browser.close();
  }

  if (SMOKE_MODE === 'full' && result.roomCodes?.length) {
    const uri = process.env.MONGODB_URI;
    const dbName = process.env.MONGODB_DB;
    if (uri && dbName) {
      const cleanup = await cleanupRooms(result.roomCodes, { uri, dbName });
      console.log(`[smoke] cleanup: rooms=${cleanup.roomsDeleted} events=${cleanup.eventsDeleted} sessions=${cleanup.sessionsDeleted}`);
    } else {
      console.warn('[smoke] cleanup skipped: MONGODB_URI/MONGODB_DB not set');
    }
  }

  const failed = Object.entries(result.steps).filter(([, s]) => !s.ok);
  console.log(`\n[smoke] ${SMOKE_MODE} mode against ${BASE_URL}: ${result.ok ? 'PASS' : 'FAIL'} (${failed.length} step(s) failed)`);
  process.exit(result.ok ? 0 : 1);
})().catch((e) => {
  console.error('smoke: unhandled error', e);
  process.exit(1);
});
