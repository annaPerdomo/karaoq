import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueueEntry } from "../../pages/api/types";

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
  });

  describe("getRoom", () => {
    it("returns room data on success", async () => {
      const roomData = { id: "XYZ99", queue: [], activeVideoIndex: 0, isPlaying: false };
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(roomData) });
      const { default: getRoom } = await import("../../app/queue/getRoom");

      const result = await getRoom("XYZ99");

      expect(result).toEqual(roomData);
      expect(mockFetch).toHaveBeenCalledWith("/api/queue/XYZ99");
    });

    it("returns null on 404", async () => {
      mockFetch.mockResolvedValue({ ok: false });
      const { default: getRoom } = await import("../../app/queue/getRoom");

      const result = await getRoom("NOPE1");

      expect(result).toBeNull();
    });
  });

  describe("postEntryToQueue", () => {
    it("encodes entry fields as query params", async () => {
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
      expect(options.method).toBe("POST");
      expect(url).toContain("/api/queue/ROOM1/videos?");
      expect(url).toContain("entryId=entry-1");
      expect(url).toContain("userName=Anna+%26+Bob");
      expect(url).toContain("videoId=dQw4w9WgXcQ");
      expect(url).toContain("songTitle=Never+Gonna+Give+You+Up");
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
});
