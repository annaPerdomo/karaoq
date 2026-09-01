import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { enrichWithVideoDetails } from "../../lib/youtubeSearch";
import type { SearchResult } from "../../lib/searchCache";

const fetchMock = vi.fn();

function jsonResponse(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data } as Response;
}

function bare(videoId: string): SearchResult {
  return {
    title: `Song ${videoId}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mq.jpg`,
    videoId,
  };
}

function videoRow(id: string, status?: Record<string, unknown>) {
  return {
    id,
    contentDetails: { duration: "PT3M45S" },
    statistics: { viewCount: "1200000" },
    ...(status ? { status } : {}),
  };
}

const enriched = (videoId: string) => ({
  ...bare(videoId),
  durationSeconds: 225,
  viewCount: 1200000,
});

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("enrichWithVideoDetails", () => {
  it("asks for status alongside the badge parts", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [videoRow("a")] }));

    await enrichWithVideoDetails([bare("a")], "test-key");

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("part=contentDetails%2Cstatistics%2Cstatus");
  });

  it("drops a video whose owner disabled embedding", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        items: [
          videoRow("a", { embeddable: false }),
          videoRow("b", { embeddable: true }),
        ],
      })
    );

    const out = await enrichWithVideoDetails([bare("a"), bare("b")], "test-key");

    expect(out).toEqual([enriched("b")]);
  });

  it("keeps a video with no status object at all", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [videoRow("a")] }));

    const out = await enrichWithVideoDetails([bare("a")], "test-key");

    expect(out).toEqual([enriched("a")]);
  });

  it("drops a result videos.list never answered for", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [videoRow("a")] }));

    const out = await enrichWithVideoDetails([bare("a"), bare("b")], "test-key");

    expect(out).toEqual([enriched("a")]);
  });

  it("returns the bare results when the call is non-OK", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false, 500));

    const out = await enrichWithVideoDetails([bare("a")], "test-key");

    expect(out).toEqual([bare("a")]);
  });

  it("returns the bare results when the call throws", async () => {
    fetchMock.mockRejectedValue(new Error("enrichment down"));

    const out = await enrichWithVideoDetails([bare("a")], "test-key");

    expect(out).toEqual([bare("a")]);
  });

  it("spends nothing on an empty result set", async () => {
    const out = await enrichWithVideoDetails([], "test-key");

    expect(out).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
