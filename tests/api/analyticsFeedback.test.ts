import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { createMockReq } from "../helpers/mockRequest";

const mockToArray = vi.fn();
const mockCountDocuments = vi.fn();
const mockUpdateOne = vi.fn();
const mockFind = vi.fn();

vi.mock("mongodb", () => {
  class ObjectId {
    static isValid(id: unknown) {
      return typeof id === "string" && /^[a-f0-9]{24}$/i.test(id);
    }
    constructor(public id: string) {}
  }
  return {
    ObjectId,
    MongoClient: function () {
      return {
        connect: vi.fn(),
        close: vi.fn(),
        db: () => ({
          collection: () => ({
            find: mockFind,
            countDocuments: mockCountDocuments,
            updateOne: mockUpdateOne,
            createIndex: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      };
    },
  };
});

process.env.MONGODB_URI = "mongodb://test";
process.env.MONGODB_DB = "test-db";
process.env.ANALYTICS_SECRET = "s3cret";

import handler from "../../pages/api/analytics/feedback";

function createRes() {
  let statusCode = 200;
  let body: unknown = null;
  const res = {
    status(code: number) { statusCode = code; return res; },
    json(data: unknown) { body = data; return res; },
    setHeader: vi.fn(),
    getStatus: () => statusCode,
    getBody: () => body,
  };
  return res as unknown as NextApiResponse & {
    getStatus: () => number;
    getBody: () => unknown;
  };
}

const AUTH = { "x-analytics-secret": "s3cret" };

beforeEach(() => {
  vi.clearAllMocks();
  mockToArray.mockResolvedValue([]);
  mockCountDocuments.mockResolvedValue(0);
  mockUpdateOne.mockResolvedValue({});
  mockFind.mockReturnValue({
    sort: () => ({ skip: () => ({ limit: () => ({ toArray: mockToArray }) }) }),
  });
});

describe("GET /api/analytics/feedback", () => {
  it("refuses a request without the secret", async () => {
    const res = createRes();
    await handler(createMockReq({ method: "GET" }), res);
    expect(res.getStatus()).toBe(401);
    expect(mockFind).not.toHaveBeenCalled();
  });

  it("refuses a request with the wrong secret", async () => {
    const res = createRes();
    await handler(
      createMockReq({ method: "GET", headers: { "x-analytics-secret": "nope" } }),
      res
    );
    expect(res.getStatus()).toBe(401);
    expect(mockFind).not.toHaveBeenCalled();
  });

  it("filters unhandled rows in the query", async () => {
    const res = createRes();
    await handler(
      createMockReq({ method: "GET", query: { handled: "false" }, headers: AUTH }),
      res
    );
    expect(res.getStatus()).toBe(200);
    expect(mockFind).toHaveBeenCalledWith({ handled: false });
  });

  it("filters by kind in the query, ignoring an unknown kind", async () => {
    const res = createRes();
    await handler(
      createMockReq({ method: "GET", query: { kind: "bug" }, headers: AUTH }),
      res
    );
    expect(mockFind).toHaveBeenCalledWith({ kind: "bug" });

    await handler(
      createMockReq({ method: "GET", query: { kind: "$ne" }, headers: AUTH }),
      res
    );
    expect(mockFind).toHaveBeenLastCalledWith({});
  });

  it("reports has-more off the probe row and drops it from the page", async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({ _id: `id${i}`, message: "m" }));
    mockToArray.mockResolvedValue(rows);
    mockCountDocuments.mockResolvedValue(7);
    const res = createRes();

    await handler(
      createMockReq({ method: "GET", query: { limit: "2" }, headers: AUTH }),
      res
    );

    const body = res.getBody() as { items: unknown[]; hasMore: boolean; unhandled: number };
    expect(body.items).toHaveLength(2);
    expect(body.hasMore).toBe(true);
    expect(body.unhandled).toBe(7);
  });
});

describe("PATCH /api/analytics/feedback", () => {
  const ID = "a".repeat(24);

  it("refuses to update without the secret", async () => {
    const res = createRes();
    await handler(
      createMockReq({ method: "PATCH", body: { id: ID, handled: true } }),
      res
    );
    expect(res.getStatus()).toBe(401);
    expect(mockUpdateOne).not.toHaveBeenCalled();
  });

  it("marks a row handled", async () => {
    const res = createRes();
    await handler(
      createMockReq({ method: "PATCH", body: { id: ID, handled: true }, headers: AUTH }),
      res
    );
    expect(res.getStatus()).toBe(200);
    expect(mockUpdateOne.mock.calls[0][1]).toEqual({ $set: { handled: true } });
  });

  it("marks a row unhandled again", async () => {
    const res = createRes();
    await handler(
      createMockReq({ method: "PATCH", body: { id: ID, handled: false }, headers: AUTH }),
      res
    );
    expect(mockUpdateOne.mock.calls[0][1]).toEqual({ $set: { handled: false } });
  });

  // Falling through to "handled" here would bury a report nobody triaged.
  it("rejects a body without a boolean flag", async () => {
    for (const body of [{ id: ID }, { id: ID, handled: "false" }]) {
      const res = createRes();
      await handler(createMockReq({ method: "PATCH", body, headers: AUTH }), res);
      expect(res.getStatus()).toBe(400);
    }
    expect(mockUpdateOne).not.toHaveBeenCalled();
  });

  it("rejects an id that isn't an ObjectId", async () => {
    const res = createRes();
    await handler(
      createMockReq({ method: "PATCH", body: { id: "nope", handled: true }, headers: AUTH }),
      res
    );
    expect(res.getStatus()).toBe(400);
    expect(mockUpdateOne).not.toHaveBeenCalled();
  });
});
