import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DEFAULT_DISPLAY_CONFIG, QueueEntry } from "../../pages/api/types";

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("Client API wrappers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("createRoom", () => {
    it("sends POST to /api/queue/:id and returns true on success", async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const { default: createRoom } = await import("../../app/queue/createRoom");

      const result = await createRoom("ABC12");

      expect(result).toBe(true);
      // Locale header tags room_created with the host's language.
      expect(mockFetch).toHaveBeenCalledWith("/api/queue/ABC12", {
        method: "POST",
        headers: { "x-karaoq-locale": "en" },
      });
    });

    it("returns false on failure", async () => {
      mockFetch.mockResolvedValue({ ok: false });
      const { default: createRoom } = await import("../../app/queue/createRoom");

      const result = await createRoom("FAIL1");

      expect(result).toBe(false);
    });

    it("returns false instead of throwing when the network is down", async () => {
      mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));
      const { default: createRoom } = await import("../../app/queue/createRoom");

      const result = await createRoom("FAIL1");

      expect(result).toBe(false);
    });
  });

  describe("getRoom", () => {
    it("returns room data on success", async () => {
      const roomData = { id: "XYZ99", queue: [], activeVideoIndex: 0, isPlaying: false };
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(roomData) });
      const { default: getRoom } = await import("../../app/queue/getRoom");

      const result = await getRoom("XYZ99");

      expect(result).toEqual(roomData);
      expect(mockFetch).toHaveBeenCalledWith("/api/queue/XYZ99", { cache: "no-store" });
    });

    it("returns \"notFound\" only on a definitive 404", async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });
      const { default: getRoom } = await import("../../app/queue/getRoom");

      const result = await getRoom("NOPE1");

      expect(result).toBe("notFound");
    });

    it("returns \"error\" on a transient server failure, not \"notFound\"", async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });
      const { default: getRoom } = await import("../../app/queue/getRoom");

      const result = await getRoom("ROOM1");

      expect(result).toBe("error");
    });

    it("returns \"error\" when the network is down", async () => {
      mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));
      const { default: getRoom } = await import("../../app/queue/getRoom");

      const result = await getRoom("ROOM1");

      expect(result).toBe("error");
    });
  });

  describe("postEntryToQueue", () => {
    it("sends entry fields as JSON body", async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const { default: postEntryToQueue } = await import("../../app/queue/postEntryToQueue");

      const entry: QueueEntry = {
        id: "entry-1",
        userName: "Anna & Bob",
        videoId: "dQw4w9WgXcQ",
        songTitle: "Never Gonna Give You Up",
      };
      await postEntryToQueue("ROOM1", entry);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("/api/queue/ROOM1/videos");
      expect(options.method).toBe("POST");
      expect(options.headers).toEqual({ "Content-Type": "application/json" });
      expect(JSON.parse(options.body)).toEqual({
        entryId: "entry-1",
        userName: "Anna & Bob",
        videoId: "dQw4w9WgXcQ",
        songTitle: "Never Gonna Give You Up",
      });
    });

    it("sends via when the caller provides one", async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const { default: postEntryToQueue } = await import("../../app/queue/postEntryToQueue");

      await postEntryToQueue(
        "ROOM1",
        { id: "entry-1", userName: "Anna", videoId: "dQw4w9WgXcQ", songTitle: "Song" },
        "paste"
      );

      const [, options] = mockFetch.mock.calls[0];
      expect(JSON.parse(options.body).via).toBe("paste");
    });

    it("sends fromCorpus alongside the key it belongs to", async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const { default: postEntryToQueue } = await import("../../app/queue/postEntryToQueue");

      await postEntryToQueue(
        "ROOM1",
        { id: "entry-1", userName: "Anna", videoId: "dQw4w9WgXcQ", songTitle: "Song" },
        "search",
        "abba dancing queen karaoke",
        false
      );

      const [, options] = mockFetch.mock.calls[0];
      // false has to travel: absent is how an add from an older build reads.
      expect(JSON.parse(options.body).fromCorpus).toBe(false);
    });

    it("omits fromCorpus when there is no suggestion key", async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const { default: postEntryToQueue } = await import("../../app/queue/postEntryToQueue");

      await postEntryToQueue(
        "ROOM1",
        { id: "entry-1", userName: "Anna", videoId: "dQw4w9WgXcQ", songTitle: "Song" },
        "search",
        undefined,
        true
      );

      const [, options] = mockFetch.mock.calls[0];
      expect(JSON.parse(options.body)).not.toHaveProperty("fromCorpus");
    });
  });

  describe("updatePosition", () => {
    it("sends activeVideoIndex as query param", async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const { default: updatePosition } = await import("../../app/queue/updatePosition");

      await updatePosition("ROOM1", 3);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("/api/queue/ROOM1/position?activeVideoIndex=3");
      expect(options.method).toBe("POST");
    });
  });

  describe("setPlaying", () => {
    it("sends isPlaying=true as query param", async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const { default: setPlaying } = await import("../../app/queue/setPlaying");

      await setPlaying("ROOM1", true);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe("/api/queue/ROOM1/play?isPlaying=true");
    });

    it("sends isPlaying=false as query param", async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const { default: setPlaying } = await import("../../app/queue/setPlaying");

      await setPlaying("ROOM1", false);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe("/api/queue/ROOM1/play?isPlaying=false");
    });
  });

  describe("setFairMode", () => {
    it("sends enabled as query param", async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const { default: setFairMode } = await import("../../app/queue/setFairMode");

      const result = await setFairMode("ROOM1", true);

      expect(result).toBe(true);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("/api/queue/ROOM1/fair-mode?enabled=true");
      expect(options.method).toBe("POST");
    });
  });

  describe("removeFromQueue", () => {
    it("sends entryId as query param", async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const { default: removeFromQueue } = await import("../../app/queue/removeFromQueue");

      const result = await removeFromQueue("ROOM1", "entry-42");

      expect(result).toBe(true);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe("/api/queue/ROOM1/remove?entryId=entry-42");
    });
  });

  // A rejected fetch must resolve to false — an escaping rejection bricked busy-state UIs.
  describe("network failure resolves to false across wrappers", () => {
    const wrappers: [string, (mod: { default: (...args: never[]) => Promise<boolean> }) => Promise<boolean>][] = [
      ["postEntryToQueue", (m) => (m.default as (r: string, e: QueueEntry) => Promise<boolean>)("R", { id: "e", userName: "A", songTitle: "S", videoId: "v" })],
      ["removeFromQueue", (m) => (m.default as (r: string, e: string) => Promise<boolean>)("R", "e")],
      ["reorderQueue", (m) => (m.default as (r: string, q: QueueEntry[], i: number) => Promise<boolean>)("R", [], 0)],
      ["setPlaying", (m) => (m.default as (r: string, p: boolean) => Promise<boolean>)("R", true)],
      ["updatePosition", (m) => (m.default as (r: string, i: number) => Promise<boolean>)("R", 1)],
      ["postReaction", (m) => (m.default as (r: string, id: string, e: string, u: string) => Promise<boolean>)("R", "id", "🔥", "A")],
      ["joinSingWithMe", (m) => (m.default as (r: string, p: string, u: string) => Promise<boolean>)("R", "p", "A")],
      ["claimSuggestion", (m) => (m.default as (r: string, s: string, u: string) => Promise<boolean>)("R", "s", "A")],
      ["removeSingWithMe", (m) => (m.default as (r: string, p: string) => Promise<boolean>)("R", "p")],
      ["removeSuggestion", (m) => (m.default as (r: string, s: string) => Promise<boolean>)("R", "s")],
      ["setDisplayConfig", (m) => (m.default as (r: string, c: typeof DEFAULT_DISPLAY_CONFIG) => Promise<boolean>)("R", DEFAULT_DISPLAY_CONFIG)],
      ["setFairMode", (m) => (m.default as (r: string, e: boolean) => Promise<boolean>)("R", true)],
    ];

    it.each(wrappers)("%s resolves false", async (name, call) => {
      mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));
      const mod = await import(`../../app/queue/${name}`);

      await expect(call(mod)).resolves.toBe(false);
    });
  });

  describe("reorderQueue", () => {
    it("sends queue and activeVideoIndex as JSON body", async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const { default: reorderQueue } = await import("../../app/queue/reorderQueue");

      const queue: QueueEntry[] = [
        { id: "a", userName: "A", songTitle: "SA", videoId: "va" },
        { id: "b", userName: "B", songTitle: "SB", videoId: "vb" },
      ];
      await reorderQueue("ROOM1", queue, 1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("/api/queue/ROOM1/reorder");
      expect(options.method).toBe("POST");
      expect(options.headers).toEqual({ "Content-Type": "application/json" });
      expect(JSON.parse(options.body)).toEqual({ queue, activeVideoIndex: 1 });
    });
  });

  describe("setDisplayConfig", () => {
    it("sends the full config as a JSON body", async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const { default: setDisplayConfig } = await import("../../app/queue/setDisplayConfig");

      const result = await setDisplayConfig("ROOM1", DEFAULT_DISPLAY_CONFIG);

      expect(result).toBe(true);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("/api/queue/ROOM1/display-config");
      expect(options.method).toBe("POST");
      expect(options.headers).toEqual({ "Content-Type": "application/json" });
      expect(JSON.parse(options.body)).toEqual(DEFAULT_DISPLAY_CONFIG);
    });

    it("returns false on failure", async () => {
      mockFetch.mockResolvedValue({ ok: false });
      const { default: setDisplayConfig } = await import("../../app/queue/setDisplayConfig");

      const result = await setDisplayConfig("ROOM1", DEFAULT_DISPLAY_CONFIG);

      expect(result).toBe(false);
    });
  });

  describe("suggestionCuts", () => {
    const CUT = {
      title: "ABBA &amp; friends - Dancing Queen",
      thumbnailUrl: "https://i.ytimg.com/vi/abc/mq.jpg",
      videoId: "abc",
      durationSeconds: 230,
      pinned: true,
    };

    it("asks the corpus for one song key and decodes the titles", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => [CUT] });
      const { default: suggestionCuts } = await import("../../app/queue/suggestionCuts");

      const results = await suggestionCuts("abba dancing queen karaoke");

      expect(results).toEqual([{ ...CUT, title: "ABBA & friends - Dancing Queen" }]);
      const url = String(mockFetch.mock.calls[0][0]);
      expect(url).toBe(
        "/api/suggestions/cuts?song=abba+dancing+queen+karaoke"
      );
    });

    it.each([
      ["a song we hold nothing for", 404],
      ["a rate limit", 429],
    ])("surfaces %s as a SearchUnavailableError", async (_name, status) => {
      mockFetch.mockResolvedValue({ ok: false, status });
      const { default: suggestionCuts } = await import("../../app/queue/suggestionCuts");
      const { SearchUnavailableError } = await import("../../app/queue/searchYoutube");

      const err = await suggestionCuts("key").catch((e) => e);

      expect(err).toBeInstanceOf(SearchUnavailableError);
      expect(err.status).toBe(status);
    });

    it("treats an empty 200 as nothing resolved rather than no results", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => [] });
      const { default: suggestionCuts } = await import("../../app/queue/suggestionCuts");

      const err = await suggestionCuts("key").catch((e) => e);

      expect(err.status).toBe(404);
    });

    it("propagates a dropped connection instead of inventing a result", async () => {
      mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));
      const { default: suggestionCuts } = await import("../../app/queue/suggestionCuts");

      await expect(suggestionCuts("key")).rejects.toThrow(TypeError);
    });
  });

  describe("lookupVideo", () => {
    const VIDEO = {
      title: "Rick Astley &amp; friends",
      thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/mq.jpg",
      videoId: "dQw4w9WgXcQ",
      durationSeconds: 213,
      viewCount: 1500000000,
    };

    it("asks /api/video-lookup for one id and decodes the title", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => [VIDEO] });
      const { default: lookupVideo } = await import("../../app/queue/lookupVideo");

      const result = await lookupVideo("dQw4w9WgXcQ", "paste", undefined, "ROOM1");

      expect(result).toEqual({ ...VIDEO, title: "Rick Astley & friends" });
      const url = String(mockFetch.mock.calls[0][0]);
      expect(url).toContain("/api/video-lookup?");
      expect(url).toContain("id=dQw4w9WgXcQ");
      expect(url).toContain("src=paste");
      expect(url).toContain("roomId=ROOM1");
    });

    it("forwards the trending source distinctly", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => [VIDEO] });
      const { default: lookupVideo } = await import("../../app/queue/lookupVideo");

      await lookupVideo("dQw4w9WgXcQ", "trending");

      expect(String(mockFetch.mock.calls[0][0])).toContain("src=trending");
    });

    it.each([
      [404, "not_found"],
      [422, "not_embeddable"],
      [503, "quota"],
    ])("surfaces a %i as reason %s", async (status, reason) => {
      mockFetch.mockResolvedValue({
        ok: false,
        status,
        json: async () => ({ reason, resetsAt: "2026-08-13T07:00:00.000Z" }),
      });
      const { default: lookupVideo } = await import("../../app/queue/lookupVideo");
      const { SearchUnavailableError } = await import("../../app/queue/searchYoutube");

      const err = await lookupVideo("dQw4w9WgXcQ", "paste").catch((e) => e);

      expect(err).toBeInstanceOf(SearchUnavailableError);
      expect(err.status).toBe(status);
      expect(err.reason).toBe(reason);
    });

    it("treats an empty 200 as a missing video rather than a crash", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => [] });
      const { default: lookupVideo } = await import("../../app/queue/lookupVideo");

      const err = await lookupVideo("dQw4w9WgXcQ", "paste").catch((e) => e);

      expect(err.status).toBe(404);
      expect(err.reason).toBe("not_found");
    });

    it("propagates a dropped connection instead of inventing a result", async () => {
      mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));
      const { default: lookupVideo } = await import("../../app/queue/lookupVideo");

      await expect(lookupVideo("dQw4w9WgXcQ", "paste")).rejects.toThrow(TypeError);
    });
  });
});
