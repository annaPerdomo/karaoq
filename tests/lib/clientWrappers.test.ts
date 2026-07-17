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
      expect(mockFetch).toHaveBeenCalledWith("/api/queue/ABC12", { method: "POST" });
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

  // A rejected fetch (venue wifi dropping) must resolve to false in every
  // boolean wrapper — callers use the boolean to reset busy/in-flight state,
  // and an escaping rejection permanently bricked those UIs.
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
});
