import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { createMockReq } from "../helpers/mockRequest";

const getWorldCharts = vi.fn();
vi.mock("../../lib/shelves", () => ({ getWorldCharts: () => getWorldCharts() }));

import handler from "../../pages/api/suggestions/world";

function createRes() {
  let body: unknown = null;
  let statusCode = 200;
  const headers: Record<string, string> = {};
  const res = {
    status(code: number) { statusCode = code; return res; },
    json(data: unknown) { body = data; return res; },
    setHeader(name: string, value: string) { headers[name] = value; return res; },
    getStatus: () => statusCode,
    getBody: () => body,
    getHeader: (name: string) => headers[name],
  };
  return res as unknown as NextApiResponse & {
    getStatus: () => number;
    getBody: () => unknown;
    getHeader: (name: string) => string | undefined;
  };
}

describe("GET /api/suggestions/world", () => {
  beforeEach(() => vi.clearAllMocks());

  it("serves every chart in one CDN-cached response", async () => {
    getWorldCharts.mockResolvedValue([{ id: "world", country: "JP", songs: [] }]);
    const res = createRes();
    await handler(createMockReq({ method: "GET" }), res);
    expect(res.getBody()).toEqual({ charts: [{ id: "world", country: "JP", songs: [] }] });
    expect(res.getHeader("Cache-Control")).toContain("s-maxage=3600");
  });

  it("answers empty, uncached, when the charts can't be built", async () => {
    getWorldCharts.mockRejectedValue(new Error("db down"));
    const res = createRes();
    await handler(createMockReq({ method: "GET" }), res);
    expect(res.getBody()).toEqual({ charts: [] });
    expect(res.getHeader("Cache-Control")).toBeUndefined();
  });
});
