import http from 'k6/http';
import { check, sleep } from 'k6';
import { isAllowedHost } from './lib/guard.js';

const BASE_URL = __ENV.BASE_URL;
const ROOMS = Number(__ENV.ROOMS || 10);
const K6_TARGET_DB = __ENV.K6_TARGET_DB;
const DEMO_HEADERS = { 'x-karaoq-demo': '1' };

if (!BASE_URL) {
  throw new Error('BASE_URL is required');
}
if (!isAllowedHost(BASE_URL)) {
  throw new Error(`refusing to load-test ${BASE_URL} (host not on the allowlist)`);
}
if (!K6_TARGET_DB || K6_TARGET_DB === 'karaoq') {
  throw new Error('K6_TARGET_DB must be set to the database BASE_URL points at, and must not be "karaoq"');
}
if (ROOMS > 10) {
  throw new Error('ROOMS > 10 will fail partway through setup() — room creation is rate-limited to 10/5min per IP');
}

export const options = {
  scenarios: {
    rooms: {
      executor: 'per-vu-iterations',
      vus: ROOMS,
      iterations: 1,
      maxDuration: '5m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<800'],
    http_req_failed: ['rate<0.01'],
  },
};

function roomCode(vuId) {
  return `LOAD${String(vuId).padStart(3, '0')}${Date.now().toString(36).slice(-4)}`.toUpperCase().slice(0, 12);
}

export function setup() {
  const codes = [];
  for (let i = 1; i <= ROOMS; i++) {
    const code = roomCode(i);
    const res = http.post(`${BASE_URL}/api/queue/${code}`, null, { headers: DEMO_HEADERS });
    check(res, { 'room created': (r) => r.status === 200 || r.status === 201 });
    codes.push(code);
  }
  return { codes };
}

// Interval choices model a typical room's live traffic mix, not a spec.
export default function (data) {
  const code = data.codes[(__VU - 1) % data.codes.length];
  const end = Date.now() + 5 * 60 * 1000;
  let lastDisplay = 0;
  let lastHost = 0;
  let lastSinger = 0;
  let lastAdd = 0;

  while (Date.now() < end) {
    const now = Date.now();
    if (now - lastDisplay >= 1500) {
      http.get(`${BASE_URL}/api/queue/${code}`, { headers: DEMO_HEADERS });
      lastDisplay = now;
    }
    if (now - lastHost >= 3000) {
      http.get(`${BASE_URL}/api/queue/${code}`, { headers: DEMO_HEADERS });
      lastHost = now;
    }
    if (now - lastSinger >= 8000) {
      for (let s = 0; s < 4; s++) {
        http.get(`${BASE_URL}/api/queue/${code}`, { headers: DEMO_HEADERS });
      }
      lastSinger = now;
    }
    if (now - lastAdd >= 3 * 60 * 1000) {
      // Proxy for "one song add" — a real add needs a real video id, which
      // would burn YouTube quota on every run.
      http.get(`${BASE_URL}/api/search?q=karaoke`, { headers: DEMO_HEADERS });
      lastAdd = now;
    }
    sleep(0.5);
  }
}

// Rooms expire via the 30-day TTL (lib/mongodb.ts), or clean up immediately
// with tests/e2e/lib/cleanup.mjs and these codes.
export function teardown(data) {
  console.log(`load test done. room codes: ${data.codes.join(', ')}`);
}
