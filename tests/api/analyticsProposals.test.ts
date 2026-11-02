import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextApiResponse } from "next";
import { createMockReq } from "../helpers/mockRequest";
import { fakeCollection, type FakeCollection } from "../helpers/fakeCollection";

const collections = new Map<string, FakeCollection>();

function collection(name: string): FakeCollection {
  if (!collections.has(name)) collections.set(name, fakeCollection());
  return collections.get(name)!;
}

vi.mock("mongodb", () => ({
  MongoClient: function () {
    return {
      connect: vi.fn(),
      close: vi.fn(),
      db: () => ({
        collection: (name: string) => collection(name),
        command: vi.fn(async () => ({})),
      }),
    };
  },
}));

process.env.MONGODB_URI = "mongodb://test";
process.env.MONGODB_DB = "test-db";
process.env.ANALYTICS_SECRET = "shhh";

import handler from "../../pages/api/analytics/proposals";
import type { SongProposalDoc } from "../../lib/mongodb";

const proposals = () => collection("song_proposals");

function createRes() {
  let statusCode = 200;
  let body: any = null;
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
    getBody: () => any;
  };
}

const FIRST_SEEN = new Date("2026-09-01T00:00:00Z");

function proposal(over: Partial<SongProposalDoc> = {}): SongProposalDoc {
  return {
    _id: "sig",
    label: "The Agadiers - Mag Dungan Ta",
    candidates: [
      { artist: "Mag Dungan Ta", title: "The Agadiers" },
      { artist: "The Agadiers", title: "Mag Dungan Ta" },
    ],
    videoIds: ["v1", "v2", "v3", "v4"],
    addCount: 3,
    rooms: 1,
    addsByCountry: { PH: 3 },
    firstSeenAt: FIRST_SEEN,
    updatedAt: FIRST_SEEN,
    ...over,
  };
}

beforeEach(() => {
  collections.forEach((c) => c.clear());
});

describe("GET /api/analytics/proposals", () => {
  it("401s without the secret", async () => {
    const res = createRes();
    await handler(createMockReq({ method: "GET" }), res);
    expect(res.getStatus()).toBe(401);
  });

  it("405s on PUT", async () => {
    const res = createRes();
    await handler(
      createMockReq({ method: "PUT", headers: { "x-analytics-secret": "shhh" } }),
      res
    );
    expect(res.getStatus()).toBe(405);
  });

  it("pending excludes promoted/rejected rows and sorts by rooms", async () => {
    proposals().seed(proposal({ _id: "low", rooms: 1 }));
    proposals().seed(proposal({ _id: "high", rooms: 5 }));
    proposals().seed(proposal({ _id: "done", rooms: 9, promoteOutcome: "promoted", promotedSongId: "x" }));
    proposals().seed(proposal({ _id: "gone", rooms: 9, status: "rejected" }));

    const res = createRes();
    await handler(
      createMockReq({
        method: "GET",
        query: { view: "pending" },
        headers: { "x-analytics-secret": "shhh" },
      }),
      res
    );

    expect(res.getStatus()).toBe(200);
    const body = res.getBody();
    expect(body.rows.map((r: any) => r.id)).toEqual(["high", "low"]);
    expect(body.thresholds).toMatchObject({ minRooms: 3, minCountries: 2 });
  });

  it("caps videoIds at 3 and reports qualifies/picked", async () => {
    proposals().seed(proposal({ rooms: 3 }));

    const res = createRes();
    await handler(
      createMockReq({ method: "GET", headers: { "x-analytics-secret": "shhh" } }),
      res
    );

    const row = res.getBody().rows[0];
    expect(row.videoIds).toEqual(["v1", "v2", "v3"]);
    expect(row.qualifies).toBe(true);
    // No evidence in the fixture (no other songs or proposals seeded), and no
    // knownArtist: nothing names either side as the artist, so it's left null.
    expect(row.picked).toBeNull();
  });

  async function get(view: string) {
    const res = createRes();
    await handler(
      createMockReq({
        method: "GET",
        query: { view },
        headers: { "x-analytics-secret": "shhh" },
      }),
      res
    );
    return res.getBody().rows.map((r: any) => r.id);
  }

  it("drops a rejected row out of the promoted view", async () => {
    proposals().seed(proposal({ promoteOutcome: "promoted", promotedSongId: "x" }));
    expect(await get("promoted")).toEqual(["sig"]);

    const res = createRes();
    await handler(
      createMockReq({
        method: "POST",
        headers: { "x-analytics-secret": "shhh" },
        body: { id: "sig", action: "reject" },
      }),
      res
    );

    expect(await get("promoted")).toEqual([]);
  });

  it("drops a rejected row out of the unnamed view", async () => {
    proposals().seed(proposal({ promoteOutcome: "unnamed" }));
    expect(await get("unnamed")).toEqual(["sig"]);

    const res = createRes();
    await handler(
      createMockReq({
        method: "POST",
        headers: { "x-analytics-secret": "shhh" },
        body: { id: "sig", action: "reject" },
      }),
      res
    );

    expect(await get("unnamed")).toEqual([]);
  });
});

describe("POST /api/analytics/proposals", () => {
  it("400s on a bad action", async () => {
    const res = createRes();
    await handler(
      createMockReq({
        method: "POST",
        headers: { "x-analytics-secret": "shhh" },
        body: { id: "sig", action: "nope" },
      }),
      res
    );
    expect(res.getStatus()).toBe(400);
  });

  it("404s on an unknown id", async () => {
    const res = createRes();
    await handler(
      createMockReq({
        method: "POST",
        headers: { "x-analytics-secret": "shhh" },
        body: { id: "missing", action: "approve" },
      }),
      res
    );
    expect(res.getStatus()).toBe(404);
  });

  it("approves and promotes", async () => {
    proposals().seed(proposal({ rooms: 0, addsByCountry: {}, knownArtist: "Mag Dungan Ta" }));

    const res = createRes();
    await handler(
      createMockReq({
        method: "POST",
        headers: { "x-analytics-secret": "shhh" },
        body: { id: "sig", action: "approve" },
      }),
      res
    );

    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toMatchObject({ result: "promoted" });
    expect(proposals().get("sig")).toMatchObject({ status: "approved" });
  });

  it("400s on an approve with only one of artist/title", async () => {
    proposals().seed(proposal());
    const res = createRes();
    await handler(
      createMockReq({
        method: "POST",
        headers: { "x-analytics-secret": "shhh" },
        body: { id: "sig", action: "approve", artist: "Someone" },
      }),
      res
    );
    expect(res.getStatus()).toBe(400);
  });

  it("rejects", async () => {
    proposals().seed(proposal());

    const res = createRes();
    await handler(
      createMockReq({
        method: "POST",
        headers: { "x-analytics-secret": "shhh" },
        body: { id: "sig", action: "reject" },
      }),
      res
    );

    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toMatchObject({ result: "rejected" });
    expect(proposals().get("sig")).toMatchObject({ status: "rejected" });
  });
});
