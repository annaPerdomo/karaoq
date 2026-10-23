import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { createMockReq } from "../helpers/mockRequest";

const isFlagEnabledMock = vi.fn();
vi.mock("../../lib/featureFlags", () => ({
  isFlagEnabled: (...args: unknown[]) => isFlagEnabledMock(...args),
}));

vi.mock("mongodb", () => ({
  MongoClient: function () {
    return {
      connect: vi.fn(),
      close: vi.fn(),
      db: () => ({
        collection: () => ({ find: () => ({ toArray: async () => [] }) }),
      }),
    };
  },
}));

process.env.MONGODB_URI = "mongodb://test";
process.env.MONGODB_DB = "test-db";
process.env.YOUTUBE_API_KEY = "test-key";
process.env.CRON_SECRET = "s3cr3t";

import handler from "../../pages/api/cron/suggestions";

function createRes() {
  let statusCode = 200;
  let body: unknown = null;
  const res = {
    status(code: number) { statusCode = code; return res; },
    json(data: unknown) { body = data; return res; },
    getStatus: () => statusCode,
    getBody: () => body,
  };
  return res as unknown as NextApiResponse & { getStatus: () => number; getBody: () => unknown };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("corpus_cron kill switch", () => {
  it("401s before the flag check when the cron secret is wrong", async () => {
    isFlagEnabledMock.mockResolvedValue(false);
    const res = createRes();
    await handler(
      createMockReq({ method: "GET", headers: { authorization: "Bearer wrong" } }),
      res
    );
    expect(res.getStatus()).toBe(401);
    expect(isFlagEnabledMock).not.toHaveBeenCalled();
  });

  it("returns 200 skipped:flag right after auth when off", async () => {
    isFlagEnabledMock.mockResolvedValue(false);
    const res = createRes();
    await handler(
      createMockReq({ method: "GET", headers: { authorization: "Bearer s3cr3t" } }),
      res
    );
    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toEqual({ skipped: "flag" });
  });

  it("still skips (and logs) when off during a forced mop-up slot", async () => {
    isFlagEnabledMock.mockResolvedValue(false);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const res = createRes();
    await handler(
      createMockReq({
        method: "GET",
        headers: { authorization: "Bearer s3cr3t" },
        query: { slot: "3", mopUp: "1", force: "1" },
      }),
      res
    );
    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toEqual({ skipped: "flag" });
    expect(logSpy).toHaveBeenCalledWith(
      "Corpus cron skipped: corpus_cron flag off",
      { slot: "3", mopUp: true }
    );
    logSpy.mockRestore();
  });
});
