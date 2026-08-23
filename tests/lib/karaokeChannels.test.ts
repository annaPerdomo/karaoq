import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

process.env.YOUTUBE_API_KEY = "test-key";

import {
  harvestKaraokeChannels,
  type ChannelBatch,
  type HarvestCursor,
} from "../../lib/karaokeChannels";

// How many pages of 50 each fake channel holds before it runs out.
type Depth = Record<string, number>;

interface FakeApi {
  /** Playlist ids whose pages return 403, as a spent quota would. */
  failing?: Set<string>;
  /** Handles that don't resolve to a channel. */
  unresolvable?: Set<string>;
  /** Page tokens the API rejects, as a stale one would be. */
  badTokens?: Set<string>;
}

function fakeYoutube(depth: Depth, api: FakeApi = {}) {
  const calls = { channels: 0, pages: 0 };
  const fetchMock = vi.fn(async (url: string) => {
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith("/channels")) {
      calls.channels += 1;
      const handle = parsed.searchParams.get("forHandle")!;
      if (api.unresolvable?.has(handle)) return json({ items: [] });
      return json({
        items: [{ contentDetails: { relatedPlaylists: { uploads: `UP_${handle}` } } }],
      });
    }
    calls.pages += 1;
    const playlistId = parsed.searchParams.get("playlistId")!;
    if (api.failing?.has(playlistId)) {
      return { ok: false, status: 403, json: async () => ({}) } as Response;
    }
    const token = parsed.searchParams.get("pageToken");
    if (token && api.badTokens?.has(token)) {
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    }
    const total = depth[playlistId] ?? 1;
    // The token is the 0-based index of the page it asks for.
    const page = Number(parsed.searchParams.get("pageToken") ?? "0");
    return json({
      items: [
        {
          snippet: {
            resourceId: { videoId: `${playlistId}-v${page}` },
            title: `Track ${page} (Karaoke)`,
            thumbnails: { medium: { url: "t" } },
          },
        },
      ],
      ...(page + 1 < total ? { nextPageToken: String(page + 1) } : {}),
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

function json(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function collector() {
  const batches: ChannelBatch[] = [];
  return {
    batches,
    onChannel: async (batch: ChannelBatch) => {
      batches.push(batch);
    },
  };
}

const NEVER = Number.MAX_SAFE_INTEGER;

function options(over: Partial<Parameters<typeof harvestKaraokeChannels>[1]> = {}) {
  const sink = collector();
  return {
    opts: {
      totalPages: 100,
      pagesPerChannel: 100,
      cursors: new Map<string, HarvestCursor>(),
      deadlineMs: NEVER,
      resweepAfterMs: 14 * 24 * 60 * 60 * 1000,
      onChannel: sink.onChannel,
      ...over,
    },
    batches: sink.batches,
  };
}

describe("harvestKaraokeChannels", () => {
  beforeEach(() => {
    delete process.env.KARAOKE_PLAYLISTS;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stops at the total page budget rather than spending it per channel", async () => {
    // A per-channel cap times 35 channels was the real ceiling, and at 400
    // pages each it exceeded the whole day's unit pool.
    const calls = fakeYoutube({ UP_a: 500, UP_b: 500, UP_c: 500 });
    const { opts } = options({ totalPages: 5, pagesPerChannel: 400 });

    const report = await harvestKaraokeChannels(["a", "b", "c"], opts);

    expect(report.pages).toBe(5);
    expect(calls.pages).toBe(5);
    expect(report.stoppedEarly).toBe(true);
  });

  it("caps each channel so one enormous one can't starve the rest", async () => {
    const calls = fakeYoutube({ UP_a: 500, UP_b: 500, UP_c: 500 });
    const { opts, batches } = options({ totalPages: 100, pagesPerChannel: 2 });

    const report = await harvestKaraokeChannels(["a", "b", "c"], opts);

    expect(calls.pages).toBe(6);
    expect(report.channels).toEqual(["a", "b", "c"]);
    expect(batches).toHaveLength(3);
  });

  it("hands each channel over as it finishes, not at the end of the sweep", async () => {
    fakeYoutube({ UP_a: 1, UP_b: 1 });
    const { opts, batches } = options();

    await harvestKaraokeChannels(["a", "b"], opts);

    expect(batches.map((b) => b.channel)).toEqual(["a", "b"]);
    expect(batches[0].videos[0].videoId).toBe("UP_a-v0");
  });

  it("resumes from a saved cursor without re-resolving the handle", async () => {
    const calls = fakeYoutube({ UP_a: 10 });
    const cursors = new Map<string, HarvestCursor>([
      ["a", { playlistId: "UP_a", pageToken: "7" }],
    ]);
    const { opts, batches } = options({ cursors, pagesPerChannel: 1 });

    await harvestKaraokeChannels(["a"], opts);

    // No channels.list unit spent, and it picked up at page 7 rather than 0.
    expect(calls.channels).toBe(0);
    expect(batches[0].videos[0].videoId).toBe("UP_a-v7");
    expect(batches[0].cursor.pageToken).toBe("8");
  });

  it("marks a channel done only when YouTube says the pages ran out", async () => {
    fakeYoutube({ UP_a: 2 });
    const { opts, batches } = options();

    await harvestKaraokeChannels(["a"], opts);

    expect(batches[0].cursor.completedAt).toBeInstanceOf(Date);
    expect(batches[0].cursor.pageToken).toBeUndefined();
  });

  it("does not mark a channel done when the page call fails", async () => {
    // A 403 returns no nextPageToken, which used to look like the end of a
    // playlist and parked a live channel as finished forever.
    fakeYoutube({ UP_a: 50 }, { failing: new Set(["UP_a"]) });
    const { opts, batches } = options();

    const report = await harvestKaraokeChannels(["a"], opts);

    expect(batches).toHaveLength(0);
    expect(report.missing).toContain("a");
    expect(report.channels).not.toContain("a");
  });

  it("leaves a finished channel alone until the resweep window passes", async () => {
    const calls = fakeYoutube({ UP_a: 5, UP_b: 5 });
    const cursors = new Map<string, HarvestCursor>([
      ["a", { playlistId: "UP_a", completedAt: new Date() }],
    ]);
    const { opts } = options({ cursors });

    const report = await harvestKaraokeChannels(["a", "b"], opts);

    expect(report.channels).toEqual(["b"]);
    expect(calls.pages).toBe(5);
  });

  it("re-walks a channel once its resweep window has passed", async () => {
    fakeYoutube({ UP_a: 2 });
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const cursors = new Map<string, HarvestCursor>([
      ["a", { playlistId: "UP_a", completedAt: old, pageToken: "1" }],
    ]);
    const { opts, batches } = options({ cursors });

    await harvestKaraokeChannels(["a"], opts);

    // From the newest upload again, not from the token it finished on.
    expect(batches[0].videos[0].videoId).toBe("UP_a-v0");
  });

  it("gives up once the API is refusing every call", async () => {
    const calls = fakeYoutube({}, { failing: new Set(["UP_a", "UP_b", "UP_c", "UP_d"]) });
    const { opts } = options();

    const report = await harvestKaraokeChannels(["a", "b", "c", "d"], opts);

    expect(calls.pages).toBe(3);
    expect(report.stoppedEarly).toBe(true);
  });

  it("walks past handles that no longer resolve", async () => {
    // Handles get renamed, and the language-pack channels are at the tail of
    // the list: three dead ones ending the sweep walls off everything behind.
    const calls = fakeYoutube(
      { UP_e: 1 },
      { unresolvable: new Set(["a", "b", "c", "d"]) }
    );
    const { opts, batches } = options();

    const report = await harvestKaraokeChannels(["a", "b", "c", "d", "e"], opts);

    expect(calls.channels).toBe(5);
    expect(report.missing).toEqual(["a", "b", "c", "d"]);
    expect(report.channels).toEqual(["e"]);
    expect(batches).toHaveLength(1);
  });

  it("clears a page token the API rejects rather than retrying it nightly", async () => {
    const calls = fakeYoutube({ UP_a: 5 }, { badTokens: new Set(["3"]) });
    const cursors = new Map<string, HarvestCursor>([
      ["a", { playlistId: "UP_a", pageToken: "3" }],
    ]);
    const { opts, batches } = options({ cursors });

    const report = await harvestKaraokeChannels(["a"], opts);

    expect(calls.pages).toBe(1);
    expect(report.missing).toEqual(["a"]);
    // Parked without the token, so the next run restarts the channel instead of
    // buying the same rejection for good.
    expect(batches).toHaveLength(1);
    expect(batches[0].cursor.pageToken).toBeUndefined();
    expect(batches[0].cursor.completedAt).toBeUndefined();
  });

  it("stops starting work at the deadline", async () => {
    const calls = fakeYoutube({ UP_a: 500, UP_b: 500 });
    const { opts } = options({ deadlineMs: Date.now() - 1 });

    const report = await harvestKaraokeChannels(["a", "b"], opts);

    expect(calls.pages).toBe(0);
    expect(report.stoppedEarly).toBe(true);
  });
});
