import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { createMockReq } from "../helpers/mockRequest";

const getGenreShelves = vi.fn();
vi.mock("../../lib/genreShelves", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/genreShelves")>()),
  getGenreShelves: (...a: unknown[]) => getGenreShelves(...a),
}));

import handler from "../../pages/api/suggestions/genres";

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

describe("GET /api/suggestions/genres", () => {
  beforeEach(() => vi.clearAllMocks());

  it("serves a charted place's genres with a CDN cache header", async () => {
    const genres = [{ slug: "anime", country: "JP", songs: [] }];
    getGenreShelves.mockResolvedValue(genres);
    const res = createRes();

    await handler(createMockReq({ method: "GET", query: { c: "JP" } }), res);

    expect(getGenreShelves).toHaveBeenCalledWith("jp");
    expect(res.getBody()).toEqual({ genres });
    expect(res.getHeader("Cache-Control")).toContain("s-maxage=3600");
  });

  it("answers an uncharted or made-up place with nothing, without a lookup", async () => {
    for (const c of ["zz", "usa", "constructor", ""]) {
      const res = createRes();
      await handler(createMockReq({ method: "GET", query: { c } }), res);
      expect(res.getBody()).toEqual({ genres: [] });
    }
    expect(getGenreShelves).not.toHaveBeenCalled();
  });

  it("rechecks soon when a place has no genres yet", async () => {
    getGenreShelves.mockResolvedValue([]);
    const res = createRes();
    await handler(createMockReq({ method: "GET", query: { c: "jp" } }), res);
    expect(res.getHeader("Cache-Control")).toContain("s-maxage=300");
  });

  it("serves an empty list uncached when the lookup fails", async () => {
    getGenreShelves.mockRejectedValue(new Error("db down"));
    const res = createRes();
    await handler(createMockReq({ method: "GET", query: { c: "jp" } }), res);
    expect(res.getBody()).toEqual({ genres: [] });
    expect(res.getHeader("Cache-Control")).toBeUndefined();
  });

  it("rejects anything but GET", async () => {
    const res = createRes();
    await handler(createMockReq({ method: "POST", query: { c: "jp" } }), res);
    expect(res.getStatus()).toBe(405);
  });
});
