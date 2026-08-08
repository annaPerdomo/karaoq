import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { createMockReq } from "../helpers/mockRequest";

const mockInsertOne = vi.fn();

vi.mock("mongodb", () => ({
  MongoClient: function () {
    return {
      connect: vi.fn(),
      close: vi.fn(),
      db: () => ({
        collection: () => ({
          insertOne: mockInsertOne,
          createIndex: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    };
  },
}));

process.env.MONGODB_URI = "mongodb://test";
process.env.MONGODB_DB = "test-db";

import handler from "../../pages/api/feedback";
import { MAX_STORED_UA_LENGTH } from "../../lib/limits";

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

// Every case shares one IP bucket, so vary it to stay clear of the rate limit.
let ip = 0;
function reqWith(body: unknown, headers: Record<string, string> = {}) {
  ip += 1;
  return createMockReq({
    method: "POST",
    body,
    headers: { "x-forwarded-for": `10.0.0.${ip}`, ...headers },
  });
}

describe("POST /api/feedback", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores a submission with its room context", async () => {
    mockInsertOne.mockResolvedValue({});
    const res = createRes();

    await handler(
      reqWith(
        { kind: "bug", message: "Queue froze", roomId: "ABC123", role: "host" },
        { "x-karaoq-locale": "ja", "x-vercel-ip-country": "JP", "user-agent": "iPhone" }
      ),
      res
    );

    expect(res.getStatus()).toBe(200);
    const stored = mockInsertOne.mock.calls[0][0];
    expect(stored).toMatchObject({
      kind: "bug",
      message: "Queue froze",
      roomId: "ABC123",
      role: "host",
      locale: "ja",
      country: "JP",
      userAgent: "iPhone",
      handled: false,
    });
    expect(stored.createdAt).toBeInstanceOf(Date);
  });

  it("stores a submission sent from the landing page, with no room", async () => {
    mockInsertOne.mockResolvedValue({});
    const res = createRes();

    await handler(reqWith({ kind: "idea", message: "Add duets", page: "/" }), res);

    expect(res.getStatus()).toBe(200);
    expect(mockInsertOne.mock.calls[0][0]).toMatchObject({
      kind: "idea",
      page: "/",
      contact: "",
    });
  });

  it("caps the user-agent header, which arrives uncapped", async () => {
    mockInsertOne.mockResolvedValue({});
    const res = createRes();

    await handler(
      reqWith(
        { kind: "bug", message: "slow" },
        { "user-agent": "iPhone" + "x".repeat(8000) }
      ),
      res
    );

    expect(res.getStatus()).toBe(200);
    const { userAgent } = mockInsertOne.mock.calls[0][0];
    expect(userAgent).toHaveLength(MAX_STORED_UA_LENGTH);
    expect(userAgent.startsWith("iPhone")).toBe(true);
  });

  it("rejects an empty message without writing", async () => {
    const res = createRes();
    await handler(reqWith({ kind: "bug", message: "   " }), res);
    expect(res.getStatus()).toBe(400);
    expect(mockInsertOne).not.toHaveBeenCalled();
  });

  it("rejects anything but POST", async () => {
    const res = createRes();
    await handler(createMockReq({ method: "GET" }), res);
    expect(res.getStatus()).toBe(405);
    expect(mockInsertOne).not.toHaveBeenCalled();
  });

  it("reports a failed write instead of pretending it landed", async () => {
    mockInsertOne.mockRejectedValue(new Error("down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = createRes();

    await handler(reqWith({ kind: "other", message: "hello" }), res);

    expect(res.getStatus()).toBe(500);
    spy.mockRestore();
  });

  it("throttles a flood from one address", async () => {
    mockInsertOne.mockResolvedValue({});
    const headers = { "x-forwarded-for": "203.0.113.9" };
    const send = async () => {
      const res = createRes();
      await handler(
        createMockReq({ method: "POST", body: { kind: "other", message: "spam" }, headers }),
        res
      );
      return res.getStatus();
    };

    for (let i = 0; i < 5; i++) expect(await send()).toBe(200);
    expect(await send()).toBe(429);
  });
});
