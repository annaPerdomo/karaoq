import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { createMockReq } from "../helpers/mockRequest";
import { fakeCollection, type FakeCollection } from "../helpers/fakeCollection";

const adminAuthMock = vi.fn(() => true);
vi.mock("../../lib/adminAuth", () => ({
  isAuthorizedAdmin: (...args: unknown[]) => adminAuthMock(...args),
}));

let flagsCollection: FakeCollection;
vi.mock("../../lib/mongodb", () => ({
  getFeatureFlagsCollection: async () => flagsCollection,
}));

import handler from "../../pages/api/analytics/flags";

function createRes() {
  let statusCode = 200;
  let body: unknown = null;
  const res = {
    status(code: number) { statusCode = code; return res; },
    json(data: unknown) { body = data; return res; },
    setHeader() { return res; },
    getStatus: () => statusCode,
    getBody: () => body,
  };
  return res as unknown as NextApiResponse & { getStatus: () => number; getBody: () => unknown };
}

beforeEach(() => {
  vi.clearAllMocks();
  adminAuthMock.mockReturnValue(true);
  flagsCollection = fakeCollection();
});

describe("/api/analytics/flags", () => {
  it("401s without the admin secret", async () => {
    adminAuthMock.mockReturnValue(false);
    const res = createRes();
    await handler(createMockReq({ method: "GET" }), res);
    expect(res.getStatus()).toBe(401);
  });

  it("GET lists every flag with its effective value, reading the collection directly", async () => {
    flagsCollection.seed({ _id: "boards_posting", enabled: false, updatedAt: new Date() });
    const res = createRes();
    await handler(createMockReq({ method: "GET" }), res);
    expect(res.getStatus()).toBe(200);
    const body = res.getBody() as { flags: { name: string; enabled: boolean }[] };
    expect(body.flags).toEqual(
      expect.arrayContaining([
        { name: "songs_pages", enabled: true },
        { name: "boards_posting", enabled: false },
        { name: "corpus_cron", enabled: true },
      ])
    );
  });

  it("GET falls back to the default for a malformed doc", async () => {
    flagsCollection.seed({ _id: "corpus_cron", enabled: "nope", updatedAt: new Date() });
    const res = createRes();
    await handler(createMockReq({ method: "GET" }), res);
    const body = res.getBody() as { flags: { name: string; enabled: boolean }[] };
    expect(body.flags).toEqual(
      expect.arrayContaining([{ name: "corpus_cron", enabled: true }])
    );
  });

  it("PUT rejects a malformed JSON body", async () => {
    const res = createRes();
    await handler(createMockReq({ method: "PUT", body: "{not json" }), res);
    expect(res.getStatus()).toBe(400);
  });

  it("PUT rejects an unknown flag name", async () => {
    const res = createRes();
    await handler(
      createMockReq({ method: "PUT", body: { name: "not_a_flag", enabled: false } }),
      res
    );
    expect(res.getStatus()).toBe(400);
  });

  it("PUT upserts a flag, and a subsequent GET reflects it", async () => {
    const putRes = createRes();
    await handler(
      createMockReq({
        method: "PUT",
        body: { name: "corpus_cron", enabled: false, note: "paused for maintenance" },
      }),
      putRes
    );
    expect(putRes.getStatus()).toBe(200);
    const doc = flagsCollection.get("corpus_cron");
    expect(doc?.enabled).toBe(false);
    expect(doc?.note).toBe("paused for maintenance");

    const getRes = createRes();
    await handler(createMockReq({ method: "GET" }), getRes);
    const body = getRes.getBody() as { flags: { name: string; enabled: boolean }[] };
    expect(body.flags).toEqual(
      expect.arrayContaining([{ name: "corpus_cron", enabled: false }])
    );
  });

  it("405s any other method", async () => {
    const res = createRes();
    await handler(createMockReq({ method: "DELETE" }), res);
    expect(res.getStatus()).toBe(405);
  });
});
