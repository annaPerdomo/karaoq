import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { createMockReq } from "../helpers/mockRequest";

const mockCollection = {
  findOne: vi.fn(),
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

import handler from "../../pages/api/queue/[id]/keys";
import { hashRoomKey } from "../../lib/roomKeys";

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

describe("POST /api/queue/[id]/keys - Mint a co-host key", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mints a co-host key when the host key is presented", async () => {
    mockCollection.findOne.mockResolvedValue({
      id: "ROOM1",
      keys: [{ hash: hashRoomKey("host-key"), role: "host", createdAt: new Date() }],
    });
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      headers: { "x-room-key": "host-key" },
      body: { role: "cohost" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    const body = res.getBody() as { roomKey: string; roomKeyRole: string };
    expect(body.roomKeyRole).toBe("cohost");
    expect(typeof body.roomKey).toBe("string");
    expect(mockCollection.updateOne).toHaveBeenCalled();
  });

  it("rejects a cohost key with 403", async () => {
    mockCollection.findOne.mockResolvedValue({
      id: "ROOM1",
      keys: [{ hash: hashRoomKey("cohost-key"), role: "cohost", createdAt: new Date() }],
    });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      headers: { "x-room-key": "cohost-key" },
      body: { role: "cohost" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(403);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("rejects a legacy room with 403 — nothing to protect", async () => {
    mockCollection.findOne.mockResolvedValue({ id: "ROOM1" });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { role: "cohost" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(403);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("rejects a non-existent room with 404", async () => {
    mockCollection.findOne.mockResolvedValue(null);

    const req = createMockReq({
      method: "POST",
      query: { id: "NOPE1" },
      headers: { "x-room-key": "host-key" },
      body: { role: "cohost" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(404);
  });

  it("rejects an invalid role with 400", async () => {
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      headers: { "x-room-key": "host-key" },
      body: { role: "host" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
  });

  it("evicts the oldest cohost key at the cap, never the host key", async () => {
    const hostEntry = { hash: hashRoomKey("host-key"), role: "host" as const, createdAt: new Date(2020, 0, 1) };
    const cohostEntries = Array.from({ length: 20 }, (_, i) => ({
      hash: hashRoomKey(`cohost-${i}`),
      role: "cohost" as const,
      createdAt: new Date(2021, 0, i + 1),
    }));
    mockCollection.findOne.mockResolvedValue({
      id: "ROOM1",
      keys: [hostEntry, ...cohostEntries],
    });
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      headers: { "x-room-key": "host-key" },
      body: { role: "cohost" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    // First call evicts the oldest cohost entry; the host entry is never targeted.
    expect(mockCollection.updateOne).toHaveBeenNthCalledWith(
      1,
      { id: "ROOM1" },
      { $pull: { keys: { hash: cohostEntries[0].hash } } }
    );
    expect(mockCollection.updateOne).toHaveBeenCalledTimes(2);
  });

  it("rejects non-POST methods with 405", async () => {
    const req = createMockReq({ method: "GET", query: { id: "ROOM1" } });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(405);
  });
});
