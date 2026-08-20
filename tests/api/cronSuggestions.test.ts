import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { createMockReq } from "../helpers/mockRequest";

const demandRows: any[] = [];

vi.mock("mongodb", () => ({
  MongoClient: function () {
    return {
      connect: vi.fn(),
      close: vi.fn(),
      db: () => ({
        collection: () => ({
          aggregate: () => ({ toArray: async () => demandRows }),
          createIndex: vi.fn(async () => "ok"),
        }),
        command: vi.fn(async () => ({})),
      }),
    };
  },
}));

const pendingEntriesMock = vi.fn(async (..._args: unknown[]) => [] as any[]);
vi.mock("../../lib/suggestionResolver", () => ({
  pendingEntries: (...args: unknown[]) => pendingEntriesMock(...args),
  thinEntries: vi.fn(async () => []),
  seedFromSearchCache: vi.fn(async () => ({ seeded: 0, keys: [] })),
  seedFromAdds: vi.fn(async () => ({ seeded: 0, rejected: 0 })),
  seedFromKaraokeChannels: vi.fn(async () => ({
    seeded: 0,
    channels: [],
    missing: [],
    units: 0,
    pages: 0,
    stoppedEarly: false,
  })),
  refreshStale: vi.fn(async () => ({ refreshed: 0, dropped: 0, skipped: 0 })),
  resolveBySearch: vi.fn(async () => ({ searched: 0 })),
  pinPopularPicks: vi.fn(async () => ({ pinned: 0 })),
}));

process.env.MONGODB_URI = "mongodb://test";
process.env.MONGODB_DB = "test-db";

import handler from "../../pages/api/cron/suggestions";
import { suggestionCatalog } from "../../lib/suggestionCatalog";

function createRes() {
  let statusCode = 200;
  let body: unknown = null;
  const res = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(data: unknown) {
      body = data;
      return res;
    },
    getStatus: () => statusCode,
    getBody: () => body,
  };
  return res as unknown as NextApiResponse & {
    getStatus: () => number;
    getBody: () => unknown;
  };
}

async function run(headers: Record<string, string> = {}) {
  const req = createMockReq({ method: "GET", query: {}, headers });
  const res = createRes();
  await handler(req, res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  demandRows.length = 0;
  process.env.CRON_SECRET = "shhh";
});

describe("GET /api/cron/suggestions - authorization", () => {
  it("rejects a request with no authorization header", async () => {
    expect((await run()).getStatus()).toBe(401);
  });

  it("rejects a wrong secret", async () => {
    expect((await run({ authorization: "Bearer nope" })).getStatus()).toBe(401);
  });

  it("stays closed rather than open when CRON_SECRET isn't configured", async () => {
    // A missing env var must not publish a route that spends the API quota.
    delete process.env.CRON_SECRET;

    expect((await run({ authorization: "Bearer " })).getStatus()).toBe(401);
  });

  it("runs for Vercel's signed invocation", async () => {
    const res = await run({ authorization: "Bearer shhh" });

    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toMatchObject({ catalog: expect.any(Number) });
  });
});

describe("GET /api/cron/suggestions - demand ordering", () => {
  it("credits taps on a native-script song to its catalog entry", async () => {
    // The catalog keys these by native name while the tap event records the
    // romanisation, so rebuilding the key from the event matched nothing for
    // ja/ko/in — the packs with the heaviest use sorted last.
    const native = Array.from(suggestionCatalog().values()).find(
      (e) => e.nativeTitle
    );
    expect(native, "catalog should hold a native-script song").toBeTruthy();
    demandRows.push({
      _id: { title: native!.title, artist: native!.artist },
      count: 42,
    });

    await run({ authorization: "Bearer shhh" });

    const demand = pendingEntriesMock.mock.calls[0][0] as Map<string, number>;
    expect(demand.get(native!.key)).toBe(42);
  });

  it("ignores a tap on a song that has left the catalog", async () => {
    demandRows.push({
      _id: { title: "A Song We Removed", artist: "Nobody" },
      count: 5,
    });

    await run({ authorization: "Bearer shhh" });

    expect((pendingEntriesMock.mock.calls[0][0] as Map<string, number>).size).toBe(0);
  });
});
