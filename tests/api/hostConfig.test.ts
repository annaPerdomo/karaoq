import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { HostConfig } from "../../pages/api/types";
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

import handler from "../../pages/api/queue/[id]/host-config";

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

const validConfig: HostConfig = {
  theme: "neon",
  sidebarPosition: "left",
  sidebarWidth: 340,
  showBoards: true,
  showQr: false,
  qrPx: 118,
  nowPlayingHeight: 200,
  bannerLine: "Happy 30th, Sam!",
  bannerPx: 24,
  sectionOrder: ["qr", "boards", "queue", "banner"],
};

describe("POST /api/queue/[id]/host-config - Save host config", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores the config and bumps lastActivity", async () => {
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: validConfig,
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1" },
      {
        $set: {
          hostConfig: validConfig,
          lastActivity: expect.any(Date),
        },
      }
    );
  });

  it("records which fields differ from the defaults in analytics", async () => {
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });
    mockCollection.insertOne.mockResolvedValue({});

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      // A production host — localhost would be analytics-exempt.
      headers: { host: "karaoq.live" },
      body: validConfig,
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.insertOne).toHaveBeenCalledOnce();
    const event = mockCollection.insertOne.mock.calls[0][0];
    expect(event.type).toBe("host_config_saved");
    expect(event.roomId).toBe("ROOM1");
    expect(event.changedFields.sort()).toEqual([
      "bannerLine",
      "bannerPx",
      "nowPlayingHeight",
      "qrPx",
      "sectionOrder",
      "showQr",
      "sidebarPosition",
      "sidebarWidth",
      "theme",
    ]);
    expect(event.hostConfig).toEqual(validConfig);
  });

  it.each([
    ["theme", "party"],
    ["sidebarPosition", "top"],
    ["sidebarWidth", 100],
    ["sidebarWidth", 500],
    ["qrPx", 20],
    ["qrPx", 301],
    ["nowPlayingHeight", 63],
    ["nowPlayingHeight", 261],
    ["sectionOrder", ["boards", "qr"]],
    ["sectionOrder", ["queue", "queue", "qr"]],
    ["sectionOrder", ["queue", "boards", "nope"]],
    // Retired fields — no longer part of the layout config.
    ["showCheers", true],
    ["showTransport", false],
    ["showHistory", true],
  ])("rejects invalid %s %j with 400", async (key, value) => {
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { ...validConfig, [key]: value },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("rejects a config missing a required field with 400", async () => {
    const { showBoards: _drop, ...partial } = validConfig;
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: partial,
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  // Hosts on a stale bundle still POST configs without the bar-height field.
  it("fills the default when a client omits the bar height", async () => {
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });

    const { nowPlayingHeight: _drop, ...legacyConfig } = validConfig;
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: legacyConfig,
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1" },
      {
        $set: {
          hostConfig: { ...validConfig, nowPlayingHeight: 64 },
          lastActivity: expect.any(Date),
        },
      }
    );
  });

  it("rejects unknown extra keys with 400", async () => {
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { ...validConfig, extra: "nope" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("rejects a non-object body with 400", async () => {
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: "not-an-object",
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("returns 404 for a non-existent room", async () => {
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 0 });

    const req = createMockReq({
      method: "POST",
      query: { id: "NOPE1" },
      body: validConfig,
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(404);
  });

  it("rejects non-POST methods with 405", async () => {
    const req = createMockReq({ method: "GET", query: { id: "ROOM1" } });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(405);
  });
});
