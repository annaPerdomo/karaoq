import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { DEFAULT_DISPLAY_CONFIG, Room } from "../../pages/api/types";
import { createMockReq } from "../helpers/mockRequest";

const mockCollection = {
  findOne: vi.fn(),
  insertOne: vi.fn(),
  updateOne: vi.fn(),
};

vi.mock("mongodb", () => ({
  MongoClient: function () {
    return {
      connect: vi.fn(),
      close: vi.fn(),
      db: () => ({ collection: () => mockCollection }),
    };
  },
}));

process.env.MONGODB_URI = "mongodb://test";
process.env.MONGODB_DB = "test-db";

import handler from "../../pages/api/queue/[id]/index";

function createRes() {
  let statusCode = 200;
  let body: unknown = null;

  const res = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(data: unknown) {
      body = data;
      return res;
    },
    setHeader() { return res; },
    getStatus: () => statusCode,
    getBody: () => body,
  };
  return res as unknown as NextApiResponse & {
    getStatus: () => number;
    getBody: () => unknown;
  };
}

describe("POST /api/queue/[id] - Room creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a new room when none exists", async () => {
    mockCollection.findOne.mockResolvedValue(null);
    mockCollection.insertOne.mockResolvedValue({ insertedId: "x" });

    const req = createMockReq({ method: "POST", query: { id: "ABC12" } });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(201);
    expect(res.getBody()).toEqual({
      id: "ABC12",
      queue: [],
      activeVideoIndex: 0,
      isPlaying: false,
      reactionsEnabled: true,
      fairMode: true,
      playMode: "here",
      displayConfig: DEFAULT_DISPLAY_CONFIG,
      createdAt: expect.any(Date),
      lastActivity: expect.any(Date),
    });
    expect(mockCollection.insertOne).toHaveBeenCalledWith({
      id: "ABC12",
      queue: [],
      activeVideoIndex: 0,
      isPlaying: false,
      reactionsEnabled: true,
      fairMode: true,
      playMode: "here",
      displayConfig: DEFAULT_DISPLAY_CONFIG,
      createdAt: expect.any(Date),
      lastActivity: expect.any(Date),
    });
  });

  it("resets isPlaying when the device that was playing reconnects", async () => {
    const existing: Room = {
      id: "ABC12",
      queue: [{ id: "e1", userName: "Anna", songTitle: "Song", videoId: "v1" }],
      activeVideoIndex: 0,
      isPlaying: true,
      reactionsEnabled: true,
      playToken: "tok-owner",
    };
    mockCollection.findOne.mockResolvedValue(existing);
    mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ABC12" },
      headers: { "x-play-token": "tok-owner" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect((res.getBody() as Room).isPlaying).toBe(false);
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ABC12" },
      {
        $set: { isPlaying: false, lastActivity: expect.any(Date) },
        $unset: { playToken: "", displayPaused: "", playStartedAt: "" },
      }
    );
  });

  it("does not reset isPlaying when a different host device connects", async () => {
    const existing: Room = {
      id: "ABC12",
      queue: [{ id: "e1", userName: "Anna", songTitle: "Song", videoId: "v1" }],
      activeVideoIndex: 0,
      isPlaying: true,
      reactionsEnabled: true,
      playToken: "tok-owner",
    };
    mockCollection.findOne.mockResolvedValue(existing);
    mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const req = createMockReq({ method: "POST", query: { id: "ABC12" } });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect((res.getBody() as Room).isPlaying).toBe(true);
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ABC12" },
      { $set: { lastActivity: expect.any(Date) } }
    );
  });

  it("does not reset isPlaying for a stale token from an older song", async () => {
    const existing: Room = {
      id: "ABC12",
      queue: [{ id: "e1", userName: "Anna", songTitle: "Song", videoId: "v1" }],
      activeVideoIndex: 0,
      isPlaying: true,
      reactionsEnabled: true,
      playToken: "tok-current-owner",
    };
    mockCollection.findOne.mockResolvedValue(existing);
    mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ABC12" },
      headers: { "x-play-token": "tok-from-last-week" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect((res.getBody() as Room).isPlaying).toBe(true);
  });

  it("keeps isPlaying untouched when the room plays on a separate screen", async () => {
    // Even the owner's token must not reset a TV room — playback lives on the display.
    const existing: Room = {
      id: "ABC12",
      queue: [{ id: "e1", userName: "Anna", songTitle: "Song", videoId: "v1" }],
      activeVideoIndex: 0,
      isPlaying: true,
      reactionsEnabled: true,
      playMode: "tv",
      playToken: "tok-owner",
    };
    mockCollection.findOne.mockResolvedValue(existing);
    mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ABC12" },
      headers: { "x-play-token": "tok-owner" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect((res.getBody() as Room).isPlaying).toBe(true);
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ABC12" },
      { $set: { lastActivity: expect.any(Date) } }
    );
  });

  it("rejects non-string room ID with 400", async () => {
    const req = createMockReq({ method: "POST", query: { id: ["a", "b"] } });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
  });
});

describe("GET /api/queue/[id] - Room retrieval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns room when it exists", async () => {
    const room: Room = {
      id: "XYZ99",
      queue: [],
      activeVideoIndex: 0,
      isPlaying: true,
      reactionsEnabled: true,
      displayLastSeen: new Date(), // live display → playback is real
    };
    mockCollection.findOne.mockResolvedValue(room);

    const req = createMockReq({ method: "GET", query: { id: "XYZ99" } });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toEqual({
      ...room,
      isPlaying: true,
      displayConnected: true,
      reactionsEnabled: true,
      fairMode: false,
      displayConfig: DEFAULT_DISPLAY_CONFIG,
      reactions: [],
    });
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("heals orphaned TV playback when no display is alive", async () => {
    const room: Room = {
      id: "XYZ99",
      queue: [],
      activeVideoIndex: 0,
      isPlaying: true,
      reactionsEnabled: true,
      playMode: "tv",
      playToken: "tok-dead",
      // Both well past the 75s liveness window.
      playStartedAt: new Date(Date.now() - 300_000),
      displayLastSeen: new Date(Date.now() - 300_000),
    };
    mockCollection.findOne.mockResolvedValue(room);
    mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const req = createMockReq({ method: "GET", query: { id: "XYZ99" } });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    const body = res.getBody() as Room;
    expect(body.isPlaying).toBe(false);
    expect(body.displayConnected).toBe(false);
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "XYZ99", isPlaying: true },
      {
        $set: { isPlaying: false },
        $unset: { playToken: "", displayPaused: "", playStartedAt: "" },
      }
    );
  });

  it("keeps a recently-throttled heartbeat inside the liveness window", async () => {
    // Hidden tabs can throttle timers to ~1/min; a 60s-old beat still counts
    const room: Room = {
      id: "XYZ99",
      queue: [],
      activeVideoIndex: 0,
      isPlaying: true,
      reactionsEnabled: true,
      playMode: "tv",
      playStartedAt: new Date(Date.now() - 300_000),
      displayLastSeen: new Date(Date.now() - 60_000),
    };
    mockCollection.findOne.mockResolvedValue(room);

    const req = createMockReq({ method: "GET", query: { id: "XYZ99" } });
    const res = createRes();
    await handler(req, res);

    const body = res.getBody() as Room;
    expect(body.isPlaying).toBe(true);
    expect(body.displayConnected).toBe(true);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("never heals on a display's own read — it proves a display exists", async () => {
    const room: Room = {
      id: "XYZ99",
      queue: [],
      activeVideoIndex: 0,
      isPlaying: true,
      reactionsEnabled: true,
      playMode: "tv",
      playStartedAt: new Date(Date.now() - 300_000),
      displayLastSeen: new Date(Date.now() - 300_000),
    };
    mockCollection.findOne.mockResolvedValue(room);

    const req = createMockReq({
      method: "GET",
      query: { id: "XYZ99", display: "1" },
    });
    const res = createRes();
    await handler(req, res);

    expect((res.getBody() as Room).isPlaying).toBe(true);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("gives a just-started song grace for the display to load", async () => {
    const room: Room = {
      id: "XYZ99",
      queue: [],
      activeVideoIndex: 0,
      isPlaying: true,
      reactionsEnabled: true,
      playMode: "tv",
      playStartedAt: new Date(), // pressed play moments ago
    };
    mockCollection.findOne.mockResolvedValue(room);

    const req = createMockReq({ method: "GET", query: { id: "XYZ99" } });
    const res = createRes();
    await handler(req, res);

    expect((res.getBody() as Room).isPlaying).toBe(true);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("never heals here-mode playback (its player is a host page)", async () => {
    const room: Room = {
      id: "XYZ99",
      queue: [],
      activeVideoIndex: 0,
      isPlaying: true,
      reactionsEnabled: true,
      playMode: "here",
      playStartedAt: new Date(Date.now() - 60_000),
    };
    mockCollection.findOne.mockResolvedValue(room);

    const req = createMockReq({ method: "GET", query: { id: "XYZ99" } });
    const res = createRes();
    await handler(req, res);

    expect((res.getBody() as Room).isPlaying).toBe(true);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("defaults isPlaying to false for legacy rooms", async () => {
    const legacyRoom = { id: "OLD01", queue: [], activeVideoIndex: 0 };
    mockCollection.findOne.mockResolvedValue(legacyRoom);

    const req = createMockReq({ method: "GET", query: { id: "OLD01" } });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect((res.getBody() as Room).isPlaying).toBe(false);
  });

  it("back-fills displayConfig with the default for a legacy room doc", async () => {
    const legacyRoom = { id: "OLD01", queue: [], activeVideoIndex: 0 };
    mockCollection.findOne.mockResolvedValue(legacyRoom);

    const req = createMockReq({ method: "GET", query: { id: "OLD01" } });
    const res = createRes();
    await handler(req, res);

    expect((res.getBody() as Room).displayConfig).toEqual(DEFAULT_DISPLAY_CONFIG);
  });

  it("returns a room's stored displayConfig unchanged on GET", async () => {
    const custom = { ...DEFAULT_DISPLAY_CONFIG, qrSize: "small" as const, theme: "neon" as const };
    const room = { id: "NEW01", queue: [], activeVideoIndex: 0, displayConfig: custom };
    mockCollection.findOne.mockResolvedValue(room);

    const req = createMockReq({ method: "GET", query: { id: "NEW01" } });
    const res = createRes();
    await handler(req, res);

    expect((res.getBody() as Room).displayConfig).toEqual(custom);
  });

  it("returns 404 for non-existent room", async () => {
    mockCollection.findOne.mockResolvedValue(null);

    const req = createMockReq({ method: "GET", query: { id: "NOPE1" } });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(404);
  });

  it("rejects unsupported HTTP methods", async () => {
    const req = createMockReq({ method: "DELETE", query: { id: "ABC12" } });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(405);
  });
});
