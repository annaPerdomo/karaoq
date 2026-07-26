import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockReq } from "../helpers/mockRequest";

const mockInsertOne = vi.fn();
const mockUpdateOne = vi.fn();

vi.mock("mongodb", () => ({
  MongoClient: function () {
    return {
      connect: vi.fn(),
      close: vi.fn(),
      db: () => ({
        collection: () => ({ insertOne: mockInsertOne, updateOne: mockUpdateOne }),
      }),
    };
  },
}));

process.env.MONGODB_URI = "mongodb://test";
process.env.MONGODB_DB = "test-db";

import {
  isAnalyticsExempt,
  trackEvent,
  trackSessionHeartbeat,
} from "../../lib/analytics";

describe("isAnalyticsExempt", () => {
  it.each([
    "localhost",
    "localhost:3000",
    "127.0.0.1:3000",
    "[::1]:3000",
    "0.0.0.0:3001",
    "192.168.1.42:3000",
    "10.0.0.5:3000",
    "172.16.0.9:3000",
  ])("exempts local host %s", (host) => {
    expect(isAnalyticsExempt(createMockReq({ headers: { host } }))).toBe(true);
  });

  it.each(["karaoq.live", "www.karaoq.live", "karaoq.vercel.app"])(
    "does not exempt production host %s",
    (host) => {
      expect(isAnalyticsExempt(createMockReq({ headers: { host } }))).toBe(false);
    }
  );

  it("exempts requests carrying the demo header regardless of host", () => {
    const req = createMockReq({
      headers: { host: "karaoq.live", "x-karaoq-demo": "1" },
    });
    expect(isAnalyticsExempt(req)).toBe(true);
  });

  it("exempts when only x-forwarded-host is local", () => {
    const req = createMockReq({
      headers: { host: "karaoq.live", "x-forwarded-host": "localhost:3000" },
    });
    expect(isAnalyticsExempt(req)).toBe(true);
  });

  it("does not exempt a host that merely contains a local name", () => {
    const req = createMockReq({ headers: { host: "localhost.evil.com" } });
    expect(isAnalyticsExempt(req)).toBe(false);
  });
});

describe("exempt requests skip analytics writes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("trackEvent writes for production hosts", async () => {
    mockInsertOne.mockResolvedValue({});
    const req = createMockReq({ headers: { host: "karaoq.live" } });
    await trackEvent(req, "room_created", { roomId: "ROOM1" });
    expect(mockInsertOne).toHaveBeenCalledOnce();
  });

  it("trackEvent skips localhost requests", async () => {
    const req = createMockReq({ headers: { host: "localhost:3000" } });
    await trackEvent(req, "room_created", { roomId: "ROOM1" });
    expect(mockInsertOne).not.toHaveBeenCalled();
  });

  it("trackEvent skips demo-header requests", async () => {
    const req = createMockReq({
      headers: { host: "karaoq.live", "x-karaoq-demo": "1" },
    });
    await trackEvent(req, "room_created", { roomId: "ROOM1" });
    expect(mockInsertOne).not.toHaveBeenCalled();
  });

  it("trackSessionHeartbeat skips localhost requests", async () => {
    const req = createMockReq({ headers: { host: "127.0.0.1:3000" } });
    await trackSessionHeartbeat(req, "ROOM1", "Anna", "host", "client-1");
    expect(mockUpdateOne).not.toHaveBeenCalled();
  });

  it("trackSessionHeartbeat writes for production hosts", async () => {
    mockUpdateOne.mockResolvedValue({});
    const req = createMockReq({ headers: { host: "karaoq.live" } });
    await trackSessionHeartbeat(req, "ROOM1", "Anna", "host", "client-1");
    expect(mockUpdateOne).toHaveBeenCalledOnce();
  });
});

describe("language capture", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records the locale header on events", async () => {
    mockInsertOne.mockResolvedValue({});
    const req = createMockReq({
      headers: { host: "karaoq.live", "x-karaoq-locale": "ja" },
    });
    await trackEvent(req, "room_created", { roomId: "ROOM1" });
    expect(mockInsertOne.mock.calls[0][0]).toMatchObject({
      type: "room_created",
      locale: "ja",
    });
  });

  it("omits locale entirely when the header is missing", async () => {
    mockInsertOne.mockResolvedValue({});
    const req = createMockReq({ headers: { host: "karaoq.live" } });
    await trackEvent(req, "room_created", { roomId: "ROOM1" });
    expect(mockInsertOne.mock.calls[0][0]).not.toHaveProperty("locale");
  });

  it("ignores a locale header we don't ship a catalog for", async () => {
    mockInsertOne.mockResolvedValue({});
    const req = createMockReq({
      headers: { host: "karaoq.live", "x-karaoq-locale": "xx" },
    });
    await trackEvent(req, "room_created", { roomId: "ROOM1" });
    expect(mockInsertOne.mock.calls[0][0]).not.toHaveProperty("locale");
  });

  it("stores the session's locale and how it was picked", async () => {
    mockUpdateOne.mockResolvedValue({});
    const req = createMockReq({ headers: { host: "karaoq.live" } });
    await trackSessionHeartbeat(req, "ROOM1", "Anna", "host", "c1", "ko", "switch");
    const [, pipeline] = mockUpdateOne.mock.calls[0];
    expect(pipeline[0].$set).toMatchObject({
      locale: { $literal: "ko" },
      localeSource: { $literal: "switch" },
    });
  });

  it("leaves session language fields unset when the client sends none", async () => {
    mockUpdateOne.mockResolvedValue({});
    const req = createMockReq({ headers: { host: "karaoq.live" } });
    await trackSessionHeartbeat(req, "ROOM1", "Anna", "host", "c1");
    const [, pipeline] = mockUpdateOne.mock.calls[0];
    expect(pipeline[0].$set).not.toHaveProperty("locale");
    expect(pipeline[0].$set).not.toHaveProperty("localeSource");
  });
});
