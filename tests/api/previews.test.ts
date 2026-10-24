import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { createMockReq } from "../helpers/mockRequest";

const previewsFor = vi.fn();
vi.mock("../../lib/cutPick", () => ({ previewsFor: (...a: unknown[]) => previewsFor(...a) }));

import handler from "../../pages/api/suggestions/previews";
import { SONG_SECTIONS } from "../../app/queue/songSuggestions";
import { ideaKey } from "../../app/queue/fetchPreviews";

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

describe("GET /api/suggestions/previews", () => {
  beforeEach(() => vi.clearAllMocks());
  const category = SONG_SECTIONS[0].categories[0];

  it("looks up the category's songs by the keys the browser derives", async () => {
    previewsFor.mockResolvedValue({ k: { videoId: "v" } });
    const res = createRes();

    await handler(createMockReq({ method: "GET", query: { category: category.id } }), res);

    expect(previewsFor).toHaveBeenCalledWith(category.songs.map(ideaKey));
    expect(res.getBody()).toEqual({ previews: { k: { videoId: "v" } } });
    expect(res.getHeader("Cache-Control")).toContain("s-maxage=3600");
  });

  it("404s a category the browse view doesn't offer", async () => {
    const res = createRes();
    await handler(createMockReq({ method: "GET", query: { category: "nope" } }), res);
    expect(res.getStatus()).toBe(404);
    expect(previewsFor).not.toHaveBeenCalled();
  });

  it("answers empty, uncached, when the lookup fails", async () => {
    previewsFor.mockRejectedValue(new Error("db down"));
    const res = createRes();
    await handler(createMockReq({ method: "GET", query: { category: category.id } }), res);
    expect(res.getBody()).toEqual({ previews: {} });
    expect(res.getHeader("Cache-Control")).toBeUndefined();
  });
});
