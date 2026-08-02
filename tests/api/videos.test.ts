import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { Room } from "../../pages/api/types";
import { MAX_QUEUE_LENGTH } from "../../lib/limits";
import { createMockReq } from "../helpers/mockRequest";

const mockCollection = {
  findOne: vi.fn(),
  updateOne: vi.fn(),
  // The analytics event write lands here too — same mocked client.
  insertOne: vi.fn(),
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

import handler from "../../pages/api/queue/[id]/videos";

function createRes() {
  let statusCode = 200;
  let body: unknown = null;
  const res = {
    status(code: number) { statusCode = code; return res; },
    json(data: unknown) { body = data; return res; },
    getStatus: () => statusCode,
    getBody: () => body,
  };
  return res as unknown as NextApiResponse & { getStatus: () => number; getBody: () => unknown };
}

describe("POST /api/queue/[id]/videos - Add song to queue", () => {
  beforeEach(() => vi.clearAllMocks());

  it("adds a song to an existing room's queue", async () => {
    const room: Room = { id: "ROOM1", queue: [], activeVideoIndex: 0, isPlaying: false };
    mockCollection.findOne.mockResolvedValue(room);
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: {
        entryId: "entry-1",
        userName: "Anna",
        videoId: "dQw4w9WgXcQ",
        songTitle: "Never Gonna Give You Up",
      },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    // The fair-mode exclusion and queue cap ride in the filter so concurrent writes can't race.
    expect(mockCollection.updateOne).toHaveBeenCalledTimes(1);
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      {
        id: "ROOM1",
        fairMode: { $ne: true },
        $expr: { $lt: [{ $size: "$queue" }, MAX_QUEUE_LENGTH] },
      },
      {
        $push: {
          queue: {
            id: "entry-1",
            userName: "Anna",
            videoId: "dQw4w9WgXcQ",
            songTitle: "Never Gonna Give You Up",
            // Server-stamped queue time, never taken from the body.
            addedAt: expect.any(Number),
          },
        },
        $set: { lastActivity: expect.any(Date) },
      }
    );
  });

  // The queue-time estimate is only as good as what gets stored here.
  it("stores the song's length when the search knew it", async () => {
    const room: Room = { id: "ROOM1", queue: [], activeVideoIndex: 0, isPlaying: false };
    mockCollection.findOne.mockResolvedValue(room);
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: {
        entryId: "entry-1",
        userName: "Anna",
        videoId: "dQw4w9WgXcQ",
        songTitle: "Song",
        durationSeconds: 243,
      },
    });
    await handler(req, createRes());

    const [, update] = mockCollection.updateOne.mock.calls[0];
    expect(update.$push.queue.durationSeconds).toBe(243);
  });

  it("queues the song anyway when the length is implausible", async () => {
    const room: Room = { id: "ROOM1", queue: [], activeVideoIndex: 0, isPlaying: false };
    mockCollection.findOne.mockResolvedValue(room);
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: {
        entryId: "entry-1",
        userName: "Anna",
        videoId: "dQw4w9WgXcQ",
        songTitle: "Song",
        // A 24/7 livestream would wreck every ETA in the room.
        durationSeconds: 86_400,
      },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    const [, update] = mockCollection.updateOne.mock.calls[0];
    expect(update.$push.queue).not.toHaveProperty("durationSeconds");
  });

  it("inserts at the fair index when the room is in fair mode", async () => {
    const entry = (id: string, userName: string) => ({
      id, userName, songTitle: `Song ${id}`, videoId: "dQw4w9WgXcQ",
    });
    // Upcoming is fair-sorted A, B, C, A, A; a new B is round 1 → before the round-2 A → index 5.
    const room: Room = {
      id: "ROOM1",
      queue: [
        entry("cur", "X"),
        entry("a1", "A"), entry("b1", "B"), entry("c1", "C"),
        entry("a2", "A"), entry("a3", "A"),
      ],
      activeVideoIndex: 0,
      isPlaying: true,
      fairMode: true,
    } as Room;
    mockCollection.findOne.mockResolvedValue(room);
    mockCollection.updateOne
      .mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 }) // fair room: append filter can't match
      .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 }); // positional insert lands

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { entryId: "b2", userName: "B", videoId: "dQw4w9WgXcQ", songTitle: "Song b2" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.updateOne).toHaveBeenLastCalledWith(
      // CAS on the exact queue + pointer snapshot the index was computed against.
      {
        id: "ROOM1",
        queue: room.queue,
        activeVideoIndex: 0,
        $expr: { $lt: [{ $size: "$queue" }, MAX_QUEUE_LENGTH] },
      },
      {
        $push: {
          queue: {
            $each: [
              {
                id: "b2",
                userName: "B",
                videoId: "dQw4w9WgXcQ",
                songTitle: "Song b2",
                addedAt: expect.any(Number),
              },
            ],
            $position: 5,
          },
        },
        $set: { lastActivity: expect.any(Date) },
      }
    );
  });

  it("counts the current song toward the new song's round (acceptance case)", async () => {
    const entry = (id: string, userName: string) => ({
      id, userName, songTitle: `Song ${id}`, videoId: "dQw4w9WgXcQ",
    });
    // Pointer on A1; B1 counts toward the new B's round even though it follows it → index 4.
    const room: Room = {
      id: "ROOM1",
      queue: [
        entry("a1", "A"), entry("b1", "B"), entry("c1", "C"),
        entry("a2", "A"), entry("a3", "A"),
      ],
      activeVideoIndex: 0,
      isPlaying: false,
      fairMode: true,
    } as Room;
    mockCollection.findOne.mockResolvedValue(room);
    mockCollection.updateOne
      .mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 })
      .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { entryId: "b2", userName: "B", videoId: "dQw4w9WgXcQ", songTitle: "Song b2" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    const [, update] = mockCollection.updateOne.mock.calls[1];
    expect(update.$push.queue.$position).toBe(4);
  });

  it("falls back to a plain append after fair-insert CAS exhaustion", async () => {
    const room: Room = {
      id: "ROOM1",
      queue: [],
      activeVideoIndex: 0,
      isPlaying: false,
      fairMode: true,
    } as Room;
    mockCollection.findOne.mockResolvedValue(room);
    mockCollection.updateOne
      .mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 }) // append (fair room)
      .mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 }) // insert attempt 1
      .mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 }) // insert attempt 2
      .mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 }) // insert attempt 3
      .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 }); // fallback append

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { entryId: "e1", userName: "A", videoId: "dQw4w9WgXcQ", songTitle: "Song" },
    });
    const res = createRes();
    await handler(req, res);

    // A song must never be lost to fairness — the fallback drops the fairMode condition.
    expect(res.getStatus()).toBe(200);
    expect(mockCollection.updateOne).toHaveBeenCalledTimes(5);
    expect(mockCollection.updateOne).toHaveBeenLastCalledWith(
      { id: "ROOM1", $expr: { $lt: [{ $size: "$queue" }, MAX_QUEUE_LENGTH] } },
      {
        $push: {
          queue: {
            id: "e1",
            userName: "A",
            videoId: "dQw4w9WgXcQ",
            songTitle: "Song",
            addedAt: expect.any(Number),
          },
        },
        $set: { lastActivity: expect.any(Date) },
      }
    );
  });

  it("409s when concurrent adds filled the queue between check and write", async () => {
    const room: Room = { id: "ROOM1", queue: [], activeVideoIndex: 0, isPlaying: false };
    mockCollection.findOne.mockResolvedValue(room);
    // The pre-check passed on a stale snapshot, but the guarded write matched nothing.
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: {
        entryId: "entry-2",
        userName: "Bob",
        videoId: "dQw4w9WgXcQ",
        songTitle: "Song",
      },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(409);
  });

  it("returns 404 when room does not exist", async () => {
    mockCollection.findOne.mockResolvedValue(null);

    const req = createMockReq({
      method: "POST",
      query: { id: "NOPE1" },
      body: {
        entryId: "e1",
        userName: "Bob",
        videoId: "dQw4w9WgXcQ",
        songTitle: "Song",
      },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(404);
  });

  it("returns 400 when required fields are missing", async () => {
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { entryId: "e1" }, // missing userName, videoId, songTitle
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
    expect(mockCollection.findOne).not.toHaveBeenCalled();
  });

  it("returns 400 when body is undefined", async () => {
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: undefined,
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
  });

  it("returns 400 when body is invalid JSON string", async () => {
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: "{not valid json",
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
  });

  it("rejects non-POST methods", async () => {
    const req = createMockReq({ method: "GET", query: { id: "ROOM1" } });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(405);
  });

  // The singer count must agree with the name split fair rotation charges turns for.
  describe("singer count on the song_added event", () => {
    async function addAs(userName: string) {
      vi.clearAllMocks();
      const room: Room = { id: "ROOM1", queue: [], activeVideoIndex: 0, isPlaying: false };
      mockCollection.findOne.mockResolvedValue(room);
      mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
      mockCollection.insertOne.mockResolvedValue({});

      const req = createMockReq({
        method: "POST",
        query: { id: "ROOM1" },
        // A production host — localhost would be analytics-exempt.
        headers: { host: "karaoq.live" },
        body: {
          entryId: "entry-1",
          userName,
          videoId: "dQw4w9WgXcQ",
          songTitle: "Never Gonna Give You Up",
        },
      });
      await handler(req, createRes());
      // The analytics write isn't awaited — it lands a tick after the handler resolves.
      await new Promise((resolve) => setTimeout(resolve, 0));

      const event = mockCollection.insertOne.mock.calls[0][0];
      expect(event.type).toBe("song_added");
      return event.singers as number;
    }

    it.each([
      ["Anna", 1],
      ["Anna & Bob", 2],
      ["anna and bob", 2],
      ["Anna+Bob", 2],
      ["Anna, Bob, Cara", 3],
    ])("counts %j as %i singer(s)", async (userName, expected) => {
      expect(await addAs(userName)).toBe(expected);
    });

    // Mirrors singerKeys' folding: a name that only looks like a pair charges one turn.
    it("counts a self-duet as one singer", async () => {
      expect(await addAs("Anna & anna")).toBe(1);
    });

    it("counts a name containing 'and' as one singer", async () => {
      expect(await addAs("Sandy")).toBe(1);
    });
  });
});
