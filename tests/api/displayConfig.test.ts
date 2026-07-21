import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { DisplayConfig } from "../../pages/api/types";
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

import handler from "../../pages/api/queue/[id]/display-config";

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

const validConfig: DisplayConfig = {
  qrSize: "large",
  qrPx: 118,
  showUpNext: true,
  upNextCount: 7,
  showNowPlaying: false,
  theme: "neon",
  sidebarPosition: "left",
  sidebarWidth: 340,
  sidebarOrder: ["upNext", "qr", "welcome", "boards"],
  welcomeLine: "  Karaoke Tuesdays  ",
  attractMode: true,
};

describe("POST /api/queue/[id]/display-config - Save display config", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores the trimmed config and bumps lastActivity", async () => {
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
          displayConfig: { ...validConfig, welcomeLine: "Karaoke Tuesdays" },
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
      body: { ...validConfig, welcomeLine: "" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.insertOne).toHaveBeenCalledOnce();
    const event = mockCollection.insertOne.mock.calls[0][0];
    expect(event.type).toBe("display_config_saved");
    expect(event.roomId).toBe("ROOM1");
    expect(event.changedFields.sort()).toEqual([
      "attractMode",
      "qrPx",
      "qrSize",
      "showNowPlaying",
      "sidebarOrder",
      "sidebarPosition",
      "sidebarWidth",
      "theme",
      "upNextCount",
    ]);
    expect(event.displayConfig).toEqual({ ...validConfig, welcomeLine: "" });
  });

  // The display's Customize mode saves boardsOnDisplay in the same action as
  // the config, so it rides along here rather than firing a second write and a
  // second display_config_saved event for one Save.
  it("writes boardsOnDisplay when the save carries it", async () => {
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", boardsOnDisplay: "false" },
      body: validConfig,
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(200);
    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { id: "ROOM1" },
      {
        $set: {
          displayConfig: { ...validConfig, welcomeLine: "Karaoke Tuesdays" },
          lastActivity: expect.any(Date),
          boardsOnDisplay: false,
        },
      }
    );
  });

  it("leaves boardsOnDisplay untouched when the save omits it", async () => {
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });

    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: validConfig,
    });
    const res = createRes();
    await handler(req, res);

    const update = mockCollection.updateOne.mock.calls[0][1];
    expect(update.$set).not.toHaveProperty("boardsOnDisplay");
  });

  // boardsOnDisplay defaults to ON, so hiding boards is the deviation worth
  // counting — enabling just restores the default.
  it("counts hiding boards as a changed field, and showing them as not", async () => {
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });
    mockCollection.insertOne.mockResolvedValue({});

    for (const [param, expected] of [
      ["false", true],
      ["true", false],
    ] as const) {
      vi.clearAllMocks();
      mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });
      mockCollection.insertOne.mockResolvedValue({});

      const req = createMockReq({
        method: "POST",
        query: { id: "ROOM1", boardsOnDisplay: param },
        headers: { host: "karaoq.live" },
        body: validConfig,
      });
      await handler(req, createRes());

      const event = mockCollection.insertOne.mock.calls[0][0];
      expect(mockCollection.insertOne).toHaveBeenCalledOnce();
      expect(event.changedFields.includes("boardsOnDisplay")).toBe(expected);
    }
  });

  it("rejects a malformed boardsOnDisplay param with 400", async () => {
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1", boardsOnDisplay: "yes" },
      body: validConfig,
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("fills defaults when a pre-drag-era client omits the layout fields", async () => {
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });

    const {
      sidebarPosition: _p,
      sidebarWidth: _w,
      sidebarOrder: _o,
      qrPx: _q,
      ...legacyConfig
    } = validConfig;
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
          displayConfig: {
            ...validConfig,
            sidebarPosition: "right",
            sidebarWidth: 280,
            sidebarOrder: ["qr", "welcome", "upNext", "boards"],
            // Derived from the coarse qrSize bucket ("large").
            qrPx: 120,
            welcomeLine: "Karaoke Tuesdays",
          },
          lastActivity: expect.any(Date),
        },
      }
    );
  });

  it.each([
    ["sidebarPosition", "top"],
    ["sidebarWidth", 100],
    ["sidebarWidth", 500],
    ["qrPx", 20],
    ["upNextCount", 0],
    ["upNextCount", 21],
    ["sidebarOrder", ["qr", "welcome"]],
    ["sidebarOrder", ["qr", "qr", "welcome"]],
    ["sidebarOrder", ["qr", "welcome", "nope"]],
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

  it("rejects an invalid enum value with 400", async () => {
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { ...validConfig, qrSize: "huge" },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("rejects an over-long welcomeLine with 400", async () => {
    const req = createMockReq({
      method: "POST",
      query: { id: "ROOM1" },
      body: { ...validConfig, welcomeLine: "x".repeat(81) },
    });
    const res = createRes();
    await handler(req, res);

    expect(res.getStatus()).toBe(400);
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
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
