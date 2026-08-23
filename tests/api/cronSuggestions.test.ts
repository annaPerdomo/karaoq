import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

vi.mock("../../lib/suggestionDemand", () => ({
  suggestionDemand: vi.fn(async () => new Map<string, number>()),
}));

process.env.MONGODB_URI = "mongodb://test";
process.env.MONGODB_DB = "test-db";
process.env.YOUTUBE_API_KEY = "test-key";

import handler from "../../pages/api/cron/suggestions";
import { MIGRATION_ID } from "../../lib/corpusMigration";
import { suggestionCatalog, type CatalogEntry } from "../../lib/suggestionCatalog";

const songs = () => collection("karaoke_songs");
const videos = () => collection("karaoke_videos");
const state = () => collection("cron_state");

const DAY_MS = 24 * 60 * 60 * 1000;
/** Past the sweep's 16-day cutoff, inside the 30-day TTL. */
const STALE_AT = new Date(Date.now() - 20 * DAY_MS);

const CHANNEL = "TestKaraoke";

const api = {
  urls: [] as string[],
  /** Ids videos.list answers with nothing: deleted, or never there. */
  missing: new Set<string>(),
  unembeddable: new Set<string>(),
  /** Ids videos.list answers for with no picture, so nothing can serve them. */
  unpictured: new Set<string>(),
  titles: new Map<string, string>(),
  uploads: [] as { videoId: string; title: string }[],
  /** Pages before the channel runs out; more than one lets it outlast a run. */
  uploadPages: 1,
  onPlaylistItems: () => {},
  searchHits: [] as { videoId: string; title: string }[],
  searchesBeforeQuota: Number.MAX_SAFE_INTEGER,
  searches: 0,
  onVideosList: () => {},
};

function json(body: unknown, status = 200): Response {
  return { ok: status < 400, status, json: async () => body } as Response;
}

function videoItem(id: string) {
  return {
    id,
    snippet: {
      title: api.titles.get(id) ?? `Track ${id}`,
      thumbnails: api.unpictured.has(id) ? {} : { medium: { url: `thumb-${id}` } },
    },
    contentDetails: { duration: "PT3M20S" },
    statistics: { viewCount: "4242" },
    status: { embeddable: !api.unembeddable.has(id) },
  };
}

function fakeYoutube(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (raw: string | URL) => {
      const url = new URL(String(raw));
      api.urls.push(url.toString());
      const endpoint = url.pathname.split("/").pop();
      if (endpoint === "videos") {
        api.onVideosList();
        const ids = (url.searchParams.get("id") ?? "").split(",").filter(Boolean);
        return json({ items: ids.filter((id) => !api.missing.has(id)).map(videoItem) });
      }
      if (endpoint === "channels") {
        return json({
          items: [{ contentDetails: { relatedPlaylists: { uploads: "UP_test" } } }],
        });
      }
      if (endpoint === "playlistItems") {
        api.onPlaylistItems();
        const page = Number(url.searchParams.get("pageToken") ?? "1");
        return json({
          items: api.uploads.map((video) => ({
            snippet: {
              resourceId: { videoId: video.videoId },
              title: video.title,
              thumbnails: { medium: { url: "t" } },
            },
          })),
          ...(page < api.uploadPages ? { nextPageToken: String(page + 1) } : {}),
        });
      }
      if (endpoint === "search") {
        api.searches += 1;
        if (api.searches > api.searchesBeforeQuota) {
          return json(
            { error: { errors: [{ reason: "quotaExceeded" }], message: "spent" } },
            403
          );
        }
        return json({
          items: api.searchHits.map((video) => ({
            id: { videoId: video.videoId },
            snippet: { title: video.title, thumbnails: { medium: { url: "t" } } },
          })),
        });
      }
      throw new Error(`unexpected fetch: ${url.pathname}`);
    })
  );
}

const calls = (endpoint: string) =>
  api.urls.filter((url) => url.indexOf(`/youtube/v3/${endpoint}?`) >= 0);

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

async function request(
  query: Record<string, string> = {},
  headers: Record<string, string> = { authorization: "Bearer shhh" }
) {
  const req = createMockReq({ method: "POST", query, headers });
  const res = createRes();
  await handler(req, res);
  return res;
}

async function run(query: Record<string, string> = {}) {
  return (await request(query)).getBody().steps;
}

/** Steps other than the migration only make sense once it has finished. */
function migrationDone(): void {
  state().seed({ _id: MIGRATION_ID, done: true, updatedAt: new Date() });
}

const catalogEntries = Array.from(suggestionCatalog().values());

/** Reachable with a plain "<artist> <title>" upload title, unlike the
 *  native-script packs. */
const PLAIN: CatalogEntry = catalogEntries.find(
  (e) => !e.nativeTitle && !e.nativeArtist
)!;

function seedSong(entry: CatalogEntry, cuts: string[], demand = 0): void {
  songs().seed({
    _id: entry.key,
    title: entry.title,
    artist: entry.artist,
    cuts,
    addCount: 0,
    addsByCountry: {},
    demand,
  });
}

/** songKeys is what makes a row a cut rather than a stray add. */
function seedVideo(
  videoId: string,
  refreshedAt = STALE_AT,
  songKeys: string[] = [PLAIN.key]
): void {
  videos().seed({
    _id: videoId,
    title: `Stale ${videoId}`,
    thumbnailUrl: "old-thumb",
    ...(songKeys.length > 0 ? { songKeys } : {}),
    sources: {},
    firstSeenAt: refreshedAt,
    refreshedAt,
  });
}

/** A clock the test moves by hand, so a step costs wall time and not suite time. */
function fakeClock(base = Date.now()): { advance: (ms: number) => void } {
  let at = base;
  vi.spyOn(Date, "now").mockImplementation(() => at);
  return { advance: (ms: number) => { at += ms; } };
}

beforeEach(() => {
  vi.clearAllMocks();
  collections.clear();
  api.urls = [];
  api.missing = new Set();
  api.unembeddable = new Set();
  api.unpictured = new Set();
  api.titles = new Map();
  api.uploads = [];
  api.uploadPages = 1;
  api.onPlaylistItems = () => {};
  api.searchHits = [];
  api.searchesBeforeQuota = Number.MAX_SAFE_INTEGER;
  api.searches = 0;
  api.onVideosList = () => {};
  fakeYoutube();
  process.env.CRON_SECRET = "shhh";
  process.env.KARAOKE_CHANNELS = CHANNEL;
  delete process.env.KARAOKE_PLAYLISTS;
  delete process.env.SUGGESTION_RESOLVE_PER_DAY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GET /api/cron/suggestions - authorization", () => {
  it("rejects a request with no authorization header", async () => {
    expect((await request({}, {})).getStatus()).toBe(401);
  });

  it("rejects a wrong secret", async () => {
    expect(
      (await request({}, { authorization: "Bearer nope" })).getStatus()
    ).toBe(401);
  });

  it("stays closed rather than open when CRON_SECRET isn't configured", async () => {
    delete process.env.CRON_SECRET;

    expect(
      (await request({}, { authorization: "Bearer " })).getStatus()
    ).toBe(401);
  });

  it("runs for Vercel's signed invocation", async () => {
    const res = await request({ search: "0" });

    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toMatchObject({ catalog: expect.any(Number) });
  });
});

describe("GET /api/cron/suggestions - the run budget", () => {
  it("reports and persists rather than failing when the clock is already gone", async () => {
    const base = Date.now();
    let started = false;
    vi.spyOn(Date, "now").mockImplementation(() => {
      if (!started) {
        started = true;
        return base;
      }
      return base + 10 * 60_000;
    });

    const res = await request();
    const steps = res.getBody().steps;

    expect(res.getStatus()).toBe(200);
    expect(steps.migrate.done).toBe(false);
    expect(steps.sweep.done).toBe(false);
    expect(steps.harvest.done).toBe(false);
    expect(steps.resolve.done).toBe(false);
    expect(state().get(MIGRATION_ID)).toMatchObject({ cursor: "catalog:" });
    expect(api.urls).toEqual([]);
  });

  it("spends a tight budget on the sweep before the harvest starts", async () => {
    migrationDone();
    seedSong(PLAIN, ["live1"]);
    seedVideo("live1");
    api.uploads = [{ videoId: "up1", title: `${PLAIN.artist} ${PLAIN.title} (Karaoke)` }];

    const base = Date.now();
    let spent = false;
    vi.spyOn(Date, "now").mockImplementation(() => (spent ? base + 10 * 60_000 : base));
    api.onVideosList = () => {
      spent = true;
    };

    const steps = await run({ search: "0" });

    expect(steps.sweep.checked).toBe(1);
    expect(calls("videos")).toHaveLength(1);
    expect(calls("playlistItems")).toEqual([]);
    expect(calls("channels")).toEqual([]);
    expect(steps.harvest.done).toBe(false);
  });
});

describe("GET /api/cron/suggestions - one run at a time", () => {
  beforeEach(migrationDone);

  it("skips a slot that overlaps a run still holding the lease", async () => {
    state().seed({
      _id: "run",
      leaseUntil: new Date(Date.now() + 60_000),
      updatedAt: new Date(),
    });
    seedSong(PLAIN, [], 30);

    const res = await request();

    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toEqual({ skipped: "locked", slot: "1" });
    expect(api.urls).toEqual([]);
  });

  it("takes a lease the last run released and frees it again on the way out", async () => {
    state().seed({
      _id: "run",
      leaseUntil: new Date(Date.now() - 1),
      updatedAt: new Date(),
    });

    expect((await request()).getBody().skipped).toBeUndefined();
    expect(state().get("run").leaseUntil.getTime()).toBeLessThanOrEqual(Date.now());
  });
});

describe("GET /api/cron/suggestions - the daily quota ledger", () => {
  beforeEach(() => {
    migrationDone();
    process.env.SUGGESTION_RESOLVE_PER_DAY = "2";
    seedSong(catalogEntries[0], [], 30);
    seedSong(catalogEntries[1], [], 20);
    seedSong(catalogEntries[2], [], 10);
    api.searchHits = [{ videoId: "hit1", title: "One (Karaoke)" }];
  });

  it("hands the second slot what the first one left, not a fresh allowance", async () => {
    const first = await run();
    expect(first.resolve).toMatchObject({ searched: 2 });

    const second = await run({ slot: "2" });

    expect(second.resolve).toMatchObject({ skipped: "searches spent today" });
    expect(calls("search")).toHaveLength(2);
    expect(songs().get(catalogEntries[2].key).cuts).toEqual([]);
  });

  it("bills the searches a step spent before it threw", async () => {
    // Recorded only on the way out, a step that dies after buying its searches
    // reads as having spent nothing.
    process.env.SUGGESTION_RESOLVE_PER_DAY = "5";
    const store = songs();
    const readSongs = store.find;
    store.find = (filter: any, options?: any) => {
      if (api.searches > 0) throw new Error("Atlas failover");
      return readSongs.call(store, filter, options);
    };

    const steps = await run();

    expect(steps.resolve).toMatchObject({ error: "Atlas failover" });
    expect(state().get("budget").spend).toMatchObject({ searches: 3 });
  });

  it("reports the budget a run actually opened with", async () => {
    await run();

    expect((await request({ slot: "2" })).getBody().budget).toMatchObject({
      searches: 0,
    });
  });

  it("starts a new day over", async () => {
    await run();
    state().seed({
      ...state().get("budget"),
      spend: { day: "1999-12-31", searches: 2, pages: 800 },
    });

    expect((await run()).resolve).toMatchObject({ searched: 1 });
  });
});

describe("GET /api/cron/suggestions - the run's clock", () => {
  beforeEach(migrationDone);

  it("caps the harvest so the search step is never handed a spent clock", async () => {
    seedSong(PLAIN, [], 30);
    api.searchHits = [{ videoId: "hit1", title: "One (Karaoke)" }];
    api.uploadPages = 1000;
    const clock = fakeClock();
    api.onPlaylistItems = () => clock.advance(20_000);

    const steps = await run();

    expect(steps.harvest.stoppedEarly).toBe(true);
    expect(calls("playlistItems").length).toBeLessThan(api.uploadPages);
    expect(steps.resolve).toMatchObject({ searched: 1, filled: 1 });
    expect(songs().get(PLAIN.key).cuts).toEqual(["hit1"]);
  });

  it("parks the channel's page token when the budget stops it mid-channel", async () => {
    api.uploadPages = 1000;
    process.env.SUGGESTION_CHANNEL_PAGES = "3";

    const steps = await run({ search: "0" });

    expect(steps.harvest).toMatchObject({ pages: 3, done: false });
    expect(state().get(`harvest:${CHANNEL}`)).toMatchObject({ cursor: "UP_test|4" });
    expect(state().get(`harvest:${CHANNEL}`).done).toBeUndefined();
    delete process.env.SUGGESTION_CHANNEL_PAGES;
  });
});

describe("GET /api/cron/suggestions - sweep", () => {
  beforeEach(migrationDone);

  it("drops what YouTube stopped serving and re-reads what it still does", async () => {
    seedSong(PLAIN, ["live1", "gone1", "blocked1"]);
    songs().seed({ ...songs().get(PLAIN.key), topVideoId: "blocked1" });
    seedVideo("live1");
    seedVideo("gone1");
    seedVideo("blocked1");
    api.missing.add("gone1");
    api.unembeddable.add("blocked1");
    api.titles.set("live1", "Fresh title (Karaoke)");

    const steps = await run({ search: "0" });

    expect(steps.sweep).toMatchObject({
      backlog: 3,
      checked: 3,
      refreshed: 1,
      dropped: 2,
      // Both dead ids came off one song: a count of songs touched would read 1.
      cutsPulled: 2,
      unpinned: 1,
      done: true,
    });
    expect(videos().get("gone1")).toBeNull();
    expect(videos().get("blocked1")).toBeNull();
    expect(songs().get(PLAIN.key).cuts).toEqual(["live1"]);
    expect(songs().get(PLAIN.key).topVideoId).toBeUndefined();
  });

  it("rewrites the retention clock and the fields the browse view shows", async () => {
    seedSong(PLAIN, ["live1"]);
    seedVideo("live1");
    api.titles.set("live1", "Fresh title (Karaoke)");

    await run({ search: "0" });

    const swept = videos().get("live1");
    expect(swept.title).toBe("Fresh title (Karaoke)");
    expect(swept.thumbnailUrl).toBe("thumb-live1");
    expect(swept.durationSeconds).toBe(200);
    expect(swept.viewCount).toBe(4242);
    expect(swept.refreshedAt.getTime()).toBeGreaterThan(STALE_AT.getTime());
  });

  it("names an add's row the night it arrives, cutoff or not", async () => {
    seedSong(PLAIN, ["added"]);
    api.titles.set("added", `${PLAIN.artist} - ${PLAIN.title} (Karaoke)`);
    videos().seed({
      _id: "added",
      title: `${PLAIN.artist} - ${PLAIN.title} (Karaoke)`,
      thumbnailUrl: "",
      songKeys: [PLAIN.key],
      sources: { adds: { count: 1, byCountry: {}, rooms: ["r1"], lastAt: new Date() } },
      firstSeenAt: new Date(),
      refreshedAt: new Date(),
    });

    const steps = await run({ search: "0" });

    expect(steps.sweep).toMatchObject({ pending: 1, backlog: 0 });
    expect(videos().get("added").thumbnailUrl).toBe("thumb-added");
    expect(songs().get(PLAIN.key).cuts).toEqual(["added"]);
  });

  it("takes a dead video out of the searches still caching it", async () => {
    seedSong(PLAIN, ["gone1"]);
    seedVideo("gone1");
    api.missing.add("gone1");
    collection("search_cache").seed({
      _id: "c1",
      key: "some song|any|relevance",
      results: [
        { videoId: "gone1", title: "Gone", thumbnailUrl: "t" },
        { videoId: "still", title: "Still here", thumbnailUrl: "t" },
      ],
      createdAt: new Date(),
    });

    const steps = await run({ search: "0" });

    expect(steps.sweep).toMatchObject({ dropped: 1, cachePruned: 1 });
    expect(collection("search_cache").get("c1").results).toEqual([
      { videoId: "still", title: "Still here", thumbnailUrl: "t" },
    ]);
  });

  it("deletes a cached search the pruning would empty", async () => {
    seedSong(PLAIN, ["gone1"]);
    seedVideo("gone1");
    api.missing.add("gone1");
    collection("search_cache").seed({
      _id: "c1",
      key: "some song|any|relevance",
      results: [{ videoId: "gone1", title: "Gone", thumbnailUrl: "t" }],
      createdAt: new Date(),
    });

    await run({ search: "0" });

    expect(collection("search_cache").get("c1")).toBeNull();
  });

  it("leaves a row alone until it is older than the refresh window", async () => {
    seedSong(PLAIN, ["fresh1"]);
    seedVideo("fresh1", new Date(Date.now() - DAY_MS));

    const steps = await run({ search: "0" });

    expect(steps.sweep).toMatchObject({ checked: 0, done: true });
    expect(calls("videos")).toEqual([]);
  });

  it("unfiles a cut an add claimed once YouTube names the video", async () => {
    seedSong(PLAIN, ["claimed"]);
    songs().seed({ ...songs().get(PLAIN.key), topVideoId: "claimed" });
    seedVideo("claimed");
    videos().seed({
      ...videos().get("claimed"),
      sources: { adds: { count: 2, byCountry: {}, rooms: ["r1", "r2"], lastAt: STALE_AT } },
    });
    api.titles.set("claimed", "Someone Else's Song (Karaoke)");

    const steps = await run({ search: "0" });

    expect(steps.sweep).toMatchObject({ unproven: 1, unpinned: 1 });
    expect(songs().get(PLAIN.key).cuts).toEqual([]);
    expect(songs().get(PLAIN.key).topVideoId).toBeUndefined();
    expect(videos().get("claimed").songKeys).toEqual([]);
  });

  it("leaves a harvested cut alone whatever its title says", async () => {
    seedSong(PLAIN, ["harvested"]);
    seedVideo("harvested");
    videos().seed({
      ...videos().get("harvested"),
      sources: {
        adds: { count: 1, byCountry: {}, rooms: ["r1"], lastAt: STALE_AT },
        harvest: { channel: CHANNEL, matchedAt: STALE_AT },
      },
    });
    api.titles.set("harvested", "Someone Else's Song (Karaoke)");

    const steps = await run({ search: "0" });

    expect(steps.sweep).toMatchObject({ unproven: 0 });
    expect(songs().get(PLAIN.key).cuts).toEqual(["harvested"]);
    expect(videos().get("harvested").songKeys).toEqual([PLAIN.key]);
  });

  it("keeps the stored name when YouTube answers with a blank one", async () => {
    seedSong(PLAIN, ["live1"]);
    seedVideo("live1");
    api.titles.set("live1", "");

    await run({ search: "0" });

    expect(videos().get("live1").title).toBe("Stale live1");
    expect(videos().get("live1").refreshedAt.getTime()).toBeGreaterThan(
      STALE_AT.getTime()
    );
  });

  it("spends nothing on a row no song names", async () => {
    seedVideo("pasted1", STALE_AT, []);

    const steps = await run({ search: "0" });

    expect(steps.sweep).toMatchObject({ backlog: 0, checked: 0 });
    expect(calls("videos")).toEqual([]);
    expect(videos().get("pasted1").refreshedAt).toEqual(STALE_AT);
  });
});

describe("GET /api/cron/suggestions - publish", () => {
  beforeEach(migrationDone);

  /** Enough live cuts for the store to answer a tap with. */
  function seedResolved(entry: CatalogEntry, count = 10): string[] {
    const ids = Array.from({ length: count }, (_, i) => `cut${i}`);
    for (const id of ids) seedVideo(id, new Date(), [entry.key]);
    seedSong(entry, ids);
    return ids;
  }

  it("hands a song whose cuts have all expired back to the resolver", async () => {
    seedSong(PLAIN, ["ghost1", "ghost2"]);
    songs().seed({ ...songs().get(PLAIN.key), topVideoId: "ghost1" });

    const steps = await run({ search: "0" });

    expect(steps.publish).toMatchObject({ reconciled: 2, emptied: 1 });
    expect(songs().get(PLAIN.key).cuts).toEqual([]);
    expect(songs().get(PLAIN.key).topVideoId).toBeUndefined();
  });

  it("keeps the live cuts and drops only the expired one", async () => {
    seedVideo("live1", new Date());
    seedSong(PLAIN, ["live1", "ghost1"]);

    const steps = await run({ search: "0" });

    expect(steps.publish).toMatchObject({ reconciled: 1, emptied: 0 });
    expect(songs().get(PLAIN.key).cuts).toEqual(["live1"]);
  });

  it("projects the corpus into the store a suggestion tap still reads", async () => {
    const ids = seedResolved(PLAIN);
    songs().seed({ ...songs().get(PLAIN.key), topVideoId: ids[3] });

    const steps = await run({ search: "0" });

    expect(steps.publish).toMatchObject({ published: 1, thin: 0 });
    const stored = collection("suggestion_videos").get(PLAIN.key);
    expect(stored.results.map((r: any) => r.videoId)).toEqual(ids);
    expect(stored.topVideoId).toBe(ids[3]);
    expect(stored.refreshedAt.getTime()).toBeGreaterThan(STALE_AT.getTime());
  });

  it("hydrates the browse fields off the corpus rather than re-reading YouTube", async () => {
    seedResolved(PLAIN);
    videos().seed({
      ...videos().get("cut0"),
      title: "Swept title (Karaoke)",
      durationSeconds: 200,
      viewCount: 4242,
    });

    await run({ search: "0" });

    expect(collection("suggestion_videos").get(PLAIN.key).results[0]).toMatchObject({
      videoId: "cut0",
      title: "Swept title (Karaoke)",
      durationSeconds: 200,
      viewCount: 4242,
    });
    expect(calls("videos")).toEqual([]);
  });

  it("stores only the cuts a tap can be served", async () => {
    const ids = seedResolved(PLAIN, 11);
    videos().seed({ ...videos().get(ids[0]), thumbnailUrl: "" });
    api.unpictured.add(ids[0]);

    const steps = await run({ search: "0" });

    expect(steps.publish).toMatchObject({ published: 1 });
    const stored = collection("suggestion_videos").get(PLAIN.key);
    expect(stored.results.map((r: any) => r.videoId)).toEqual(ids.slice(1));
    expect(songs().get(PLAIN.key).cuts).toEqual(ids);
  });

  it("counts a song thin on what it can serve, not on what it holds", async () => {
    const ids = seedResolved(PLAIN, 10);
    videos().seed({ ...videos().get(ids[0]), thumbnailUrl: "" });
    api.unpictured.add(ids[0]);

    const steps = await run({ search: "0" });

    expect(steps.publish).toMatchObject({ published: 0, thin: 1 });
  });

  it("stores nothing for a song with too few cuts to answer with", async () => {
    seedResolved(PLAIN, 4);

    const steps = await run({ search: "0" });

    expect(steps.publish).toMatchObject({ published: 0, thin: 1 });
    expect(collection("suggestion_videos").get(PLAIN.key)).toBeNull();
  });

  it("leaves a thin song's existing entry on its own retention clock", async () => {
    seedResolved(PLAIN, 4);
    collection("suggestion_videos").seed({
      _id: PLAIN.key,
      results: [],
      resolvedAt: STALE_AT,
      refreshedAt: STALE_AT,
    });

    await run({ search: "0" });

    expect(collection("suggestion_videos").get(PLAIN.key).refreshedAt).toEqual(
      STALE_AT
    );
  });

  it("resumes from its cursor and starts the loop over once it has run out", async () => {
    seedResolved(PLAIN);

    const first = await run({ search: "0" });

    expect(first.publish).toMatchObject({ done: true });
    expect(state().get("publish").cursor).toBe("");
  });
});

describe("GET /api/cron/suggestions - harvest", () => {
  beforeEach(migrationDone);

  it("files a matching upload under its song and parks the channel's cursor", async () => {
    api.uploads = [{ videoId: "up1", title: `${PLAIN.artist} ${PLAIN.title} (Karaoke)` }];

    const steps = await run({ search: "0" });

    expect(steps.harvest).toMatchObject({ songsFilled: 1, done: true });
    expect(songs().get(PLAIN.key).cuts).toContain("up1");
    expect(videos().get("up1")).toMatchObject({
      sources: { harvest: { channel: CHANNEL } },
      durationSeconds: 200,
      viewCount: 4242,
    });
    expect(state().get(`harvest:${CHANNEL}`)).toMatchObject({
      cursor: "UP_test|",
      done: true,
    });
  });

  it("resumes from the pre-corpus cursor store rather than re-walking a channel", async () => {
    collection("harvest_cursors").seed({
      _id: CHANNEL,
      playlistId: "UP_saved",
      pageToken: "page-3",
      updatedAt: new Date(),
    });

    await run({ search: "0" });

    // The saved playlist id is what makes a resume free of the channels.list unit.
    expect(calls("channels")).toEqual([]);
    const page = new URL(calls("playlistItems")[0]);
    expect(page.searchParams.get("playlistId")).toBe("UP_saved");
    expect(page.searchParams.get("pageToken")).toBe("page-3");
  });
});

describe("GET /api/cron/suggestions - resolve", () => {
  const [first, second, third] = catalogEntries;

  beforeEach(() => {
    migrationDone();
    seedSong(first, [], 30);
    seedSong(second, [], 20);
    seedSong(third, [], 10);
    api.searchHits = [
      { videoId: "hit1", title: "One (Karaoke)" },
      { videoId: "hit2", title: "Two (Karaoke)" },
    ];
  });

  it("resolves the most-wanted songs into cuts", async () => {
    const steps = await run();

    expect(steps.resolve).toMatchObject({ wanted: 3, searched: 3, filled: 3 });
    expect(songs().get(first.key).cuts).toEqual(["hit1", "hit2"]);
    expect(videos().get("hit1")).toMatchObject({
      songKeys: [first.key, second.key, third.key],
      sources: { search: { at: expect.anything() } },
    });
  });

  it("stops at the first quota error and reports how far it got", async () => {
    api.searchesBeforeQuota = 1;

    const steps = await run();

    expect(steps.resolve).toMatchObject({
      searched: 2,
      filled: 1,
      quotaSpent: true,
      done: false,
    });
    expect(songs().get(first.key).cuts).toEqual(["hit1", "hit2"]);
    expect(songs().get(third.key).cuts).toEqual([]);
  });

  it("spends what the wanted list leaves over on widening thin songs", async () => {
    songs().clear();
    seedSong(first, ["only1"], 30);
    seedVideo("only1", new Date());

    const steps = await run();

    expect(steps.resolve).toMatchObject({ wanted: 0, searched: 0, widened: 1 });
    expect(songs().get(first.key).cuts).toEqual(["only1", "hit1", "hit2"]);
  });

  it("spends no search quota at all when search is switched off", async () => {
    const steps = await run({ search: "0" });

    expect(calls("search")).toEqual([]);
    expect(steps.resolve).toMatchObject({ skipped: "search=0", done: false });
    expect(songs().get(first.key).cuts).toEqual([]);
  });

  it("backs a song off after a search that found nothing", async () => {
    api.searchHits = [];

    const steps = await run();

    expect(steps.resolve).toMatchObject({ wanted: 3, eligible: 3, missed: 3 });
    expect(songs().get(first.key).resolveMisses).toBe(1);
    expect(songs().get(first.key).nextResolveAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("skips a backed-off song and leaves it counted as still wanted", async () => {
    api.searchHits = [];
    await run();
    api.urls = [];

    const steps = await run();

    expect(steps.resolve).toMatchObject({ wanted: 3, eligible: 0, searched: 0 });
    expect(calls("search")).toEqual([]);
  });

  it("clears the backoff once a song finally resolves", async () => {
    api.searchHits = [];
    await run();
    songs().seed({ ...songs().get(first.key), nextResolveAt: new Date(Date.now() - 1) });
    api.searchHits = [{ videoId: "hit1", title: "One (Karaoke)" }];

    await run();

    const song = songs().get(first.key);
    expect(song.cuts).toEqual(["hit1"]);
    expect(song.resolveMisses).toBeUndefined();
    expect(song.nextResolveAt).toBeUndefined();
  });

  it("counts a search that answered only with cuts the song already held", async () => {
    songs().clear();
    seedSong(first, ["hit1"], 30);
    seedVideo("hit1", new Date(), [first.key]);
    api.searchHits = [{ videoId: "hit1", title: "One (Karaoke)" }];

    const steps = await run();

    expect(steps.resolve).toMatchObject({ widened: 1, filled: 0, missed: 1 });
    expect(songs().get(first.key).resolveMisses).toBe(1);
  });
});
