import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { createMockReq } from "../helpers/mockRequest";

const rooms = {
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  updateOne: vi.fn(),
  createIndex: vi.fn().mockResolvedValue(undefined),
};
const pairings = {
  insertOne: vi.fn(),
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  deleteMany: vi.fn(),
  createIndex: vi.fn().mockResolvedValue(undefined),
};

vi.mock("mongodb", () => ({
  MongoClient: function () {
    return {
      connect: vi.fn(),
      close: vi.fn(),
      db: () => ({
        collection: (name: string) => (name === "rooms" ? rooms : pairings),
      }),
    };
  },
}));

vi.mock("../../lib/analytics", () => ({
  trackEvent: vi.fn().mockResolvedValue(undefined),
}));

process.env.MONGODB_URI = "mongodb://test";
process.env.MONGODB_DB = "test-db";

import createHandler from "../../pages/api/tv-pair/index";
import pollHandler from "../../pages/api/tv-pair/[code]";
import claimHandler from "../../pages/api/tv-pair/[code]/claim";
import { __resetRateLimits } from "../../lib/limits";
import { hashRoomKey } from "../../lib/roomKeys";

function createRes() {
  let statusCode = 200;
  let body: unknown = null;
  const res = {
    status(code: number) { statusCode = code; return res; },
    json(data: unknown) { body = data; return res; },
    setHeader() { return res; },
    getStatus: () => statusCode,
    getBody: () => body,
  };
  return res as unknown as NextApiResponse & { getStatus: () => number; getBody: () => unknown };
}

describe("POST /api/tv-pair (create)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetRateLimits();
    pairings.insertOne.mockResolvedValue({ acknowledged: true });
    pairings.deleteMany.mockResolvedValue({ deletedCount: 0 });
  });

  it("mints a screen pairing, storing only the secret hash", async () => {
    const req = createMockReq({ method: "POST", body: { kind: "screen" } });
    const res = createRes();
    await createHandler(req, res);

    expect(res.getStatus()).toBe(200);
    const body = res.getBody() as { code: string; secret: string; expiresAt: number };
    expect(body.code).toMatch(/^\d{6}$/);
    expect(body.secret).toBeTruthy();
    const inserted = pairings.insertOne.mock.calls[0][0];
    expect(inserted.secretHash).toBe(hashRoomKey(body.secret));
    expect(inserted).not.toHaveProperty("secret");
  });

  it("requires a host key to mint a remote pairing", async () => {
    rooms.findOne.mockResolvedValue({
      id: "ROOM1",
      keys: [{ hash: hashRoomKey("cohost-key"), role: "cohost", createdAt: new Date() }],
    });
    const req = createMockReq({
      method: "POST",
      body: { kind: "remote", roomId: "ROOM1" },
      headers: { "x-room-key": "cohost-key" },
    });
    const res = createRes();
    await createHandler(req, res);

    expect(res.getStatus()).toBe(403);
    expect(pairings.insertOne).not.toHaveBeenCalled();
  });

  it("rejects minting a remote pairing for a legacy room", async () => {
    rooms.findOne.mockResolvedValue({ id: "ROOM1" });
    const req = createMockReq({
      method: "POST",
      body: { kind: "remote", roomId: "ROOM1" },
    });
    const res = createRes();
    await createHandler(req, res);

    expect(res.getStatus()).toBe(403);
  });

  it("mints a remote pairing with a valid host key", async () => {
    rooms.findOne.mockResolvedValue({
      id: "ROOM1",
      keys: [{ hash: hashRoomKey("host-key"), role: "host", createdAt: new Date() }],
    });
    const req = createMockReq({
      method: "POST",
      body: { kind: "remote", roomId: "ROOM1" },
      headers: { "x-room-key": "host-key" },
    });
    const res = createRes();
    await createHandler(req, res);

    expect(res.getStatus()).toBe(200);
  });

  it("stores the minting device's key hash on a remote pairing", async () => {
    rooms.findOne.mockResolvedValue({
      id: "ROOM1",
      keys: [{ hash: hashRoomKey("host-key"), role: "host", createdAt: new Date() }],
    });
    const req = createMockReq({
      method: "POST",
      body: { kind: "remote", roomId: "ROOM1" },
      headers: { "x-room-key": "host-key" },
    });
    const res = createRes();
    await createHandler(req, res);

    const inserted = pairings.insertOne.mock.calls[0][0];
    expect(inserted.minterHash).toBe(hashRoomKey("host-key"));
  });

  it("voids the minter's earlier unclaimed code before minting a new one", async () => {
    rooms.findOne.mockResolvedValue({
      id: "ROOM1",
      keys: [{ hash: hashRoomKey("host-key"), role: "host", createdAt: new Date() }],
    });
    const req = createMockReq({
      method: "POST",
      body: { kind: "remote", roomId: "ROOM1" },
      headers: { "x-room-key": "host-key" },
    });
    const res = createRes();
    await createHandler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(pairings.deleteMany).toHaveBeenCalledWith({
      minterHash: hashRoomKey("host-key"),
      claimedAt: { $exists: false },
    });
  });
});

describe("GET /api/tv-pair/[code] (poll)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetRateLimits();
  });

  it("returns 404 for an unknown code", async () => {
    pairings.findOne.mockResolvedValue(null);
    const req = createMockReq({ method: "GET", query: { code: "123456" }, headers: { "x-pair-secret": "s" } });
    const res = createRes();
    await pollHandler(req, res);
    expect(res.getStatus()).toBe(404);
  });

  it("returns 404 for the wrong secret", async () => {
    pairings.findOne.mockResolvedValue({
      _id: "123456",
      kind: "screen",
      secretHash: hashRoomKey("real-secret"),
      createdAt: new Date(),
    });
    const req = createMockReq({ method: "GET", query: { code: "123456" }, headers: { "x-pair-secret": "wrong" } });
    const res = createRes();
    await pollHandler(req, res);
    expect(res.getStatus()).toBe(404);
  });

  it("reports waiting for an unclaimed code", async () => {
    pairings.findOne.mockResolvedValue({
      _id: "123456",
      kind: "screen",
      secretHash: hashRoomKey("s"),
      createdAt: new Date(),
    });
    const req = createMockReq({ method: "GET", query: { code: "123456" }, headers: { "x-pair-secret": "s" } });
    const res = createRes();
    await pollHandler(req, res);
    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toEqual({ status: "waiting" });
  });

  it("reports claimed with the roomId, and never a key", async () => {
    pairings.findOne.mockResolvedValue({
      _id: "123456",
      kind: "screen",
      secretHash: hashRoomKey("s"),
      createdAt: new Date(),
      roomId: "ROOM1",
      claimedAt: new Date(),
    });
    const req = createMockReq({ method: "GET", query: { code: "123456" }, headers: { "x-pair-secret": "s" } });
    const res = createRes();
    await pollHandler(req, res);
    expect(res.getBody()).toEqual({ status: "claimed", roomId: "ROOM1" });
  });

  it("reports claimed with yourRole display for a claimed remote pairing, and never a key", async () => {
    pairings.findOne.mockResolvedValue({
      _id: "654321",
      kind: "remote",
      secretHash: hashRoomKey("s"),
      createdAt: new Date(),
      roomId: "ROOM1",
      claimedAt: new Date(),
      minterHash: hashRoomKey("tv-host-key"),
    });
    const req = createMockReq({ method: "GET", query: { code: "654321" }, headers: { "x-pair-secret": "s" } });
    const res = createRes();
    await pollHandler(req, res);
    expect(res.getBody()).toEqual({ status: "claimed", roomId: "ROOM1", yourRole: "display" });
  });

  it("omits yourRole for a claimed remote pairing that predates minterHash", async () => {
    pairings.findOne.mockResolvedValue({
      _id: "654321",
      kind: "remote",
      secretHash: hashRoomKey("s"),
      createdAt: new Date(),
      roomId: "ROOM1",
      claimedAt: new Date(),
    });
    const req = createMockReq({ method: "GET", query: { code: "654321" }, headers: { "x-pair-secret": "s" } });
    const res = createRes();
    await pollHandler(req, res);
    expect(res.getBody()).toEqual({ status: "claimed", roomId: "ROOM1" });
  });

  it("reports claimed even past the TTL — the room already has the key", async () => {
    pairings.findOne.mockResolvedValue({
      _id: "123456",
      kind: "screen",
      secretHash: hashRoomKey("s"),
      createdAt: new Date(Date.now() - 11 * 60_000),
      roomId: "ROOM1",
      claimedAt: new Date(Date.now() - 10 * 60_000),
    });
    const req = createMockReq({ method: "GET", query: { code: "123456" }, headers: { "x-pair-secret": "s" } });
    const res = createRes();
    await pollHandler(req, res);
    expect(res.getBody()).toEqual({ status: "claimed", roomId: "ROOM1" });
  });

  it("reports expired once the TTL has passed", async () => {
    pairings.findOne.mockResolvedValue({
      _id: "123456",
      kind: "screen",
      secretHash: hashRoomKey("s"),
      createdAt: new Date(Date.now() - 11 * 60_000),
    });
    const req = createMockReq({ method: "GET", query: { code: "123456" }, headers: { "x-pair-secret": "s" } });
    const res = createRes();
    await pollHandler(req, res);
    expect(res.getBody()).toEqual({ status: "expired" });
  });
});

describe("POST /api/tv-pair/[code]/claim", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetRateLimits();
    rooms.updateOne.mockResolvedValue({ modifiedCount: 1 });
  });

  it("responds needs-room for a screen claim with no roomId, without claiming", async () => {
    pairings.findOne.mockResolvedValue({
      _id: "123456",
      kind: "screen",
      secretHash: hashRoomKey("s"),
      createdAt: new Date(),
    });
    const req = createMockReq({ method: "POST", query: { code: "123456" }, body: {} });
    const res = createRes();
    await claimHandler(req, res);

    expect(res.getStatus()).toBe(409);
    expect(res.getBody()).toEqual({ message: "needs-room" });
    expect(pairings.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("claims a screen pairing, adding a display key to the room and setting playMode tv", async () => {
    const secretHash = hashRoomKey("tv-secret");
    pairings.findOne.mockResolvedValue({
      _id: "123456",
      kind: "screen",
      secretHash,
      createdAt: new Date(),
    });
    rooms.findOne.mockResolvedValue({
      id: "ROOM1",
      keys: [{ hash: hashRoomKey("host-key"), role: "host", createdAt: new Date() }],
    });
    pairings.findOneAndUpdate.mockResolvedValue({ _id: "123456", roomId: "ROOM1", claimedAt: new Date() });

    const req = createMockReq({
      method: "POST",
      query: { code: "123456" },
      body: { roomId: "ROOM1" },
      headers: { "x-room-key": "host-key" },
    });
    const res = createRes();
    await claimHandler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toEqual({ kind: "screen", roomId: "ROOM1" });
    expect(rooms.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1" },
      { $push: { keys: { hash: secretHash, role: "display", createdAt: expect.any(Date) } } }
    );
    expect(rooms.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1" },
      { $set: { playMode: "tv", lastActivity: expect.any(Date) } }
    );
  });

  it("evicts only the oldest display key at the cap of 10, keeping the host key", async () => {
    const secretHash = hashRoomKey("tv-secret");
    const hostKey = { hash: hashRoomKey("host-key"), role: "host" as const, createdAt: new Date() };
    const oldestDisplay = { hash: "oldest-display", role: "display" as const, createdAt: new Date(0) };
    const displayKeys = [oldestDisplay];
    for (let i = 1; i < 10; i++) {
      displayKeys.push({ hash: `display-${i}`, role: "display" as const, createdAt: new Date(i * 1000) });
    }
    pairings.findOne.mockResolvedValue({
      _id: "123456",
      kind: "screen",
      secretHash,
      createdAt: new Date(),
    });
    rooms.findOne.mockResolvedValue({ id: "ROOM1", keys: [hostKey, ...displayKeys] });
    pairings.findOneAndUpdate.mockResolvedValue({ _id: "123456", roomId: "ROOM1", claimedAt: new Date() });

    const req = createMockReq({
      method: "POST",
      query: { code: "123456" },
      body: { roomId: "ROOM1" },
      headers: { "x-room-key": "host-key" },
    });
    const res = createRes();
    await claimHandler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(rooms.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1" },
      { $pull: { keys: { hash: "oldest-display" } } }
    );
    expect(rooms.updateOne).not.toHaveBeenCalledWith(
      { id: "ROOM1" },
      { $pull: { keys: { hash: hostKey.hash } } }
    );
  });

  it("returns 410 on a second claim", async () => {
    pairings.findOne.mockResolvedValue({
      _id: "123456",
      kind: "screen",
      secretHash: hashRoomKey("s"),
      createdAt: new Date(),
      roomId: "ROOM1",
      claimedAt: new Date(),
    });
    const req = createMockReq({ method: "POST", query: { code: "123456" }, body: { roomId: "ROOM1" } });
    const res = createRes();
    await claimHandler(req, res);

    expect(res.getStatus()).toBe(410);
    expect(res.getBody()).toEqual({ message: "pair-expired" });
  });

  it("returns 410 for an expired code", async () => {
    pairings.findOne.mockResolvedValue({
      _id: "123456",
      kind: "screen",
      secretHash: hashRoomKey("s"),
      createdAt: new Date(Date.now() - 11 * 60_000),
    });
    const req = createMockReq({ method: "POST", query: { code: "123456" }, body: { roomId: "ROOM1" } });
    const res = createRes();
    await claimHandler(req, res);

    expect(res.getStatus()).toBe(410);
  });

  it("claims a remote pairing, returning a host key and demoting the minter to display", async () => {
    const minterHash = hashRoomKey("tv-host-key");
    pairings.findOne.mockResolvedValue({
      _id: "654321",
      kind: "remote",
      secretHash: hashRoomKey("s"),
      createdAt: new Date(),
      roomId: "ROOM1",
      minterHash,
    });
    pairings.findOneAndUpdate.mockResolvedValue({ _id: "654321", roomId: "ROOM1", claimedAt: new Date() });

    const req = createMockReq({ method: "POST", query: { code: "654321" }, body: {} });
    const res = createRes();
    await claimHandler(req, res);

    expect(res.getStatus()).toBe(200);
    const body = res.getBody() as { kind: string; roomId: string; roomKey: string; roomKeyRole: string };
    expect(body.kind).toBe("remote");
    expect(body.roomId).toBe("ROOM1");
    expect(body.roomKey).toBeTruthy();
    expect(body.roomKeyRole).toBe("host");
    expect(rooms.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1" },
      {
        $push: { keys: { hash: hashRoomKey(body.roomKey), role: "host", createdAt: expect.any(Date) } },
        $set: { lastActivity: expect.any(Date) },
      }
    );
    expect(rooms.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1", keys: { $elemMatch: { hash: minterHash, role: "host" } } },
      { $set: { "keys.$.role": "display" } }
    );
  });

  it("does not try to demote a minter when the pairing predates minterHash", async () => {
    pairings.findOne.mockResolvedValue({
      _id: "654321",
      kind: "remote",
      secretHash: hashRoomKey("s"),
      createdAt: new Date(),
      roomId: "ROOM1",
    });
    pairings.findOneAndUpdate.mockResolvedValue({ _id: "654321", roomId: "ROOM1", claimedAt: new Date() });

    const req = createMockReq({ method: "POST", query: { code: "654321" }, body: {} });
    const res = createRes();
    await claimHandler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(rooms.updateOne).toHaveBeenCalledTimes(1);
  });

  it("refuses the claim and rolls back the new key when the minter is no longer a host", async () => {
    const minterHash = hashRoomKey("stale-tv-key");
    pairings.findOne.mockResolvedValue({
      _id: "654321",
      kind: "remote",
      secretHash: hashRoomKey("s"),
      createdAt: new Date(),
      roomId: "ROOM1",
      minterHash,
    });
    pairings.findOneAndUpdate.mockResolvedValue({ _id: "654321", roomId: "ROOM1", claimedAt: new Date() });
    rooms.updateOne
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ modifiedCount: 0 })
      .mockResolvedValueOnce(undefined);

    const req = createMockReq({ method: "POST", query: { code: "654321" }, body: {} });
    const res = createRes();
    await claimHandler(req, res);

    expect(res.getStatus()).toBe(410);
    expect(res.getBody()).toEqual({ message: "pair-expired" });
    expect(rooms.updateOne).toHaveBeenCalledTimes(3);
    const pushedHash = rooms.updateOne.mock.calls[0][1].$push.keys.hash;
    expect(rooms.updateOne).toHaveBeenNthCalledWith(
      3,
      { id: "ROOM1" },
      { $pull: { keys: { hash: pushedHash } } }
    );
  });

  it("rate limits repeated claim attempts", async () => {
    pairings.findOne.mockResolvedValue(null);
    const req = () => createMockReq({ method: "POST", query: { code: "000000" }, body: {} });
    for (let i = 0; i < 10; i++) {
      const res = createRes();
      await claimHandler(req(), res);
    }
    const res = createRes();
    await claimHandler(req(), res);
    expect(res.getStatus()).toBe(429);
  });
});
