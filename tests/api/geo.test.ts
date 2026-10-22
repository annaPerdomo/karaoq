import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextApiResponse } from "next";
import { createMockReq } from "../helpers/mockRequest";
import handler from "../../pages/api/geo";

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

describe("GET /api/geo", () => {
  let prevVercel: string | undefined;
  beforeEach(() => {
    prevVercel = process.env.VERCEL;
  });
  afterEach(() => {
    if (prevVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
  });

  it("on Vercel, returns Vercel's country header", () => {
    process.env.VERCEL = "1";
    const req = createMockReq({ headers: { "x-vercel-ip-country": "US" } });
    const res = createRes();
    handler(req, res);
    expect(res.getBody()).toEqual({ country: "US" });
  });

  it("off Vercel, returns Cloudflare's country header", () => {
    delete process.env.VERCEL;
    const req = createMockReq({ headers: { "cf-ipcountry": "DE" } });
    const res = createRes();
    handler(req, res);
    expect(res.getBody()).toEqual({ country: "DE" });
  });

  it("returns null when the active platform's header is absent", () => {
    process.env.VERCEL = "1";
    const req = createMockReq({ headers: {} });
    const res = createRes();
    handler(req, res);
    expect(res.getBody()).toEqual({ country: null });
  });
});
