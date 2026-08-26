import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { Room } from "../../pages/api/types";
import { MAX_QUEUE_LENGTH, __resetRateLimits } from "../../lib/limits";
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

const recordAddMock = vi.fn();
vi.mock("../../lib/songCorpus", () => ({
  recordAdd: (...args: unknown[]) => recordAddMock(...args),
}));

process.env.MONGODB_URI = "mongodb://test";
process.env.MONGODB_DB = "test-db";

import handler from "../../pages/api/queue/[id]/videos";
import { suggestionCatalog } from "../../lib/suggestionCatalog";

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
  beforeEach(() => {
    vi.clearAllMocks();
    __resetRateLimits();
  });

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

  describe("via on the song_added event", () => {
    async function addVia(via: unknown) {
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
          userName: "Anna",
          videoId: "dQw4w9WgXcQ",
          songTitle: "Never Gonna Give You Up",
          ...(via !== undefined ? { via } : {}),
        },
      });
      await handler(req, createRes());
      // The analytics write isn't awaited — it lands a tick after the handler resolves.
      await new Promise((resolve) => setTimeout(resolve, 0));

      const event = mockCollection.insertOne.mock.calls[0][0];
      expect(event.type).toBe("song_added");
      return event.via as string;
    }

    it("records a pasted-link add as via paste", async () => {
      expect(await addVia("paste")).toBe("paste");
    });

    it("defaults to search when the client sends nothing", async () => {
      expect(await addVia(undefined)).toBe("search");
    });

    it("collapses unrecognized values to search", async () => {
      expect(await addVia("board_claim")).toBe("search");
    });
  });

  describe("suggestionKey provenance", () => {
    async function addWithKey(suggestionKey: unknown): Promise<unknown> {
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
          songTitle: "Dancing Queen",
          suggestionKey,
        },
      });
      await handler(req, createRes());
      await new Promise((resolve) => setTimeout(resolve, 0));
      return mockCollection.insertOne.mock.calls[0][0].suggestionKey;
    }

    it("records a key that names a real catalog song", async () => {
      const key = Array.from(suggestionCatalog().keys())[0];

      expect(await addWithKey(key)).toBe(key);
    });

    it("drops a key that isn't in the catalog", async () => {
      expect(await addWithKey("whatever i felt like sending karaoke")).toBeUndefined();
    });

    it("drops a non-string key", async () => {
      expect(await addWithKey({ $ne: null })).toBeUndefined();
    });
  });

  describe("corpus attribution", () => {
    async function addWith(body: Record<string, unknown>): Promise<unknown> {
      const room: Room = { id: "ROOM1", queue: [], activeVideoIndex: 0, isPlaying: false };
      mockCollection.findOne.mockResolvedValue(room);
      mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
      // Per call, not per test: a second add would otherwise read the first
      // one's event back and pass whatever the handler did.
      mockCollection.insertOne.mockClear();

      const req = createMockReq({
        method: "POST",
        query: { id: "ROOM1" },
        body: {
          entryId: "entry-1",
          userName: "Anna",
          videoId: "dQw4w9WgXcQ",
          songTitle: "Dancing Queen",
          ...body,
        },
      });
      await handler(req, createRes());
      await new Promise((resolve) => setTimeout(resolve, 0));
      return mockCollection.insertOne.mock.calls[0][0].fromCorpus;
    }

    it("records that the corpus served the pick", async () => {
      const key = Array.from(suggestionCatalog().keys())[0];

      expect(await addWith({ suggestionKey: key, fromCorpus: true })).toBe(true);
    });

    it("records a pick the corpus couldn't serve", async () => {
      const key = Array.from(suggestionCatalog().keys())[0];

      expect(await addWith({ suggestionKey: key, fromCorpus: false })).toBe(false);
    });

    it("ignores the flag on an add with no catalog key", async () => {
      expect(await addWith({ fromCorpus: true })).toBeUndefined();
      expect(await addWith({ suggestionKey: "not a song", fromCorpus: true })).toBeUndefined();
    });

    it("leaves a non-boolean flag absent rather than coercing it", async () => {
      const key = Array.from(suggestionCatalog().keys())[0];

      expect(await addWith({ suggestionKey: key, fromCorpus: "yes" })).toBeUndefined();
    });
  });

  describe("corpus feed", () => {
    function startAdd(
      headers: Record<string, string>,
      body: Record<string, unknown> = {}
    ) {
      const room: Room = { id: "ROOM1", queue: [], activeVideoIndex: 0, isPlaying: false };
      mockCollection.findOne.mockResolvedValue(room);
      mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

      const req = createMockReq({
        method: "POST",
        query: { id: "ROOM1" },
        headers: { host: "www.karaoq.live", ...headers },
        body: {
          entryId: "entry-1",
          userName: "Anna",
          videoId: "dQw4w9WgXcQ",
          songTitle: "Dancing Queen",
          durationSeconds: 231,
          ...body,
        },
      });
      const res = createRes();
      return { res, handled: handler(req, res) };
    }

    async function addFrom(
      headers: Record<string, string>,
      body: Record<string, unknown> = {}
    ) {
      const { res, handled } = startAdd(headers, body);
      await handled;
      return res;
    }

    it("feeds the add to the corpus, attributed the way the event is", async () => {
      const key = Array.from(suggestionCatalog().keys())[0];

      await addFrom({ "x-vercel-ip-country": "BR" }, { suggestionKey: key });

      expect(recordAddMock).toHaveBeenCalledWith(
        {
          videoId: "dQw4w9WgXcQ",
          title: "Dancing Queen",
          durationSeconds: 231,
        },
        { roomId: "ROOM1", country: "BR", suggestionKey: key, via: "search" }
      );
    });

    it("feeds a pasted link too — this is the only hook", async () => {
      await addFrom({}, { via: "paste" });

      expect(recordAddMock).toHaveBeenCalledWith(
        expect.objectContaining({ videoId: "dQw4w9WgXcQ" }),
        { roomId: "ROOM1", via: "paste" }
      );
    });

    it("answers the singer before it waits on the corpus", async () => {
      let finish: () => void = () => {};
      recordAddMock.mockReturnValue(
        new Promise<void>((resolve) => {
          finish = resolve;
        })
      );

      const { res, handled } = startAdd({});
      for (let i = 0; i < 50 && res.getBody() === null; i++) await Promise.resolve();

      expect(res.getStatus()).toBe(200);
      expect(res.getBody()).toEqual({ code: 200, message: "Song added." });
      expect(recordAddMock).toHaveBeenCalled();

      finish();
      await handled;
    });

    it("skips demo and dev traffic, as the analytics writes do", async () => {
      // One database behind both, so a seeded room must not shape the corpus.
      await addFrom({ host: "localhost:3000" });
      await addFrom({ "x-karaoq-demo": "1" });

      expect(recordAddMock).not.toHaveBeenCalled();
    });
  });
});
