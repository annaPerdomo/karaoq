import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { createMockReq } from "../helpers/mockRequest";

const getShelves = vi.fn();
vi.mock("../../lib/shelves", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/shelves")>()),
  getShelves: (...a: unknown[]) => getShelves(...a),
}));

import handler from "../../pages/api/suggestions/shelves";

function createRes() {
  let statusCode = 200;
  let body: unknown = null;
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

describe("GET /api/suggestions/shelves", () => {
  beforeEach(() => vi.clearAllMocks());

  it("serves the country's shelves with a CDN cache header", async () => {
    getShelves.mockResolvedValue([{ id: "hot", country: "US", songs: [] }]);
    const res = createRes();

    await handler(createMockReq({ method: "GET", query: { c: "us" } }), res);

    expect(getShelves).toHaveBeenCalledWith("US", null);
    expect(res.getBody()).toEqual({ shelves: [{ id: "hot", country: "US", songs: [] }] });
    expect(res.getHeader("Cache-Control")).toContain("s-maxage=3600");
  });

  it("treats a malformed or made-up country as worldwide", async () => {
    getShelves.mockResolvedValue([]);
    await handler(createMockReq({ method: "GET", query: { c: "usa" } }), createRes());
    await handler(createMockReq({ method: "GET", query: { c: "AA" } }), createRes());
    expect(getShelves.mock.calls).toEqual([[null, null], [null, null]]);
  });

  it("passes a supported UI language through and drops an unknown one", async () => {
    getShelves.mockResolvedValue([]);
    await handler(createMockReq({ method: "GET", query: { c: "US", l: "es" } }), createRes());
    await handler(createMockReq({ method: "GET", query: { c: "US", l: "xx" } }), createRes());
    expect(getShelves.mock.calls).toEqual([["US", "es"], ["US", null]]);
  });

  it("caches briefly while there is no hot shelf yet", async () => {
    getShelves.mockResolvedValue([{ id: "rooms", country: null, songs: [] }]);
    const res = createRes();
    await handler(createMockReq({ method: "GET", query: { c: "US" } }), res);
    expect(res.getHeader("Cache-Control")).toContain("s-maxage=300");
  });

  it("answers an empty list, uncached, when the shelves can't be built", async () => {
    getShelves.mockRejectedValue(new Error("db down"));
    const res = createRes();

    await handler(createMockReq({ method: "GET", query: {} }), res);

    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toEqual({ shelves: [] });
    expect(res.getHeader("Cache-Control")).toBeUndefined();
  });

  it("rejects non-GET methods", async () => {
    const res = createRes();
    await handler(createMockReq({ method: "POST" }), res);
    expect(res.getStatus()).toBe(405);
  });
});
