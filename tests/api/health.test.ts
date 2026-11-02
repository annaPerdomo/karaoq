import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextApiResponse } from "next";
import { createMockReq } from "../helpers/mockRequest";

const commandMock = vi.fn();

vi.mock("../../lib/mongodb", () => ({
  getMongoClient: vi.fn(async () => ({
    db: () => ({ command: commandMock }),
  })),
}));

function createRes() {
  let statusCode = 200;
  let body: unknown = null;
  const headers: Record<string, string> = {};
  const res = {
    status(code: number) { statusCode = code; return res; },
    json(data: unknown) { body = data; return res; },
    setHeader(name: string, value: string) { headers[name] = value; return res; },
    getStatus: () => statusCode,
    getBody: () => body,
    getHeaders: () => headers,
  };
  return res as unknown as NextApiResponse & {
    getStatus: () => number;
    getBody: () => unknown;
    getHeaders: () => Record<string, string>;
  };
}

// The ping outcome is cached for 5s in module scope, so each test gets a
// fresh module instance rather than fighting that cache.
async function freshHandler() {
  vi.resetModules();
  return (await import("../../pages/api/health")).default;
}

beforeEach(() => {
  commandMock.mockReset();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/health", () => {
  it("returns 200 when the ping succeeds", async () => {
    commandMock.mockResolvedValue({ ok: 1 });
    const handler = await freshHandler();
    const res = createRes();
    await handler(createMockReq({ method: "GET" }), res);
    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toMatchObject({ ok: true, db: "ok" });
    expect(typeof (res.getBody() as any).uptimeS).toBe("number");
    expect(res.getHeaders()["Cache-Control"]).toBe("no-store");
  });

  it("returns 503 when the ping rejects", async () => {
    commandMock.mockRejectedValue(new Error("down"));
    const handler = await freshHandler();
    const res = createRes();
    await handler(createMockReq({ method: "GET" }), res);
    expect(res.getStatus()).toBe(503);
    expect(res.getBody()).toMatchObject({ ok: false, db: "error" });
  });

  it("returns 503 within ~2s when the ping hangs", async () => {
    vi.useFakeTimers();
    commandMock.mockReturnValue(new Promise(() => {}));
    const handler = await freshHandler();
    const res = createRes();
    const pending = handler(createMockReq({ method: "GET" }), res);
    await vi.advanceTimersByTimeAsync(2_100);
    await pending;
    expect(res.getStatus()).toBe(503);
  });

  it("405s on a non-GET method", async () => {
    const handler = await freshHandler();
    const res = createRes();
    await handler(createMockReq({ method: "POST" }), res);
    expect(res.getStatus()).toBe(405);
    expect(commandMock).not.toHaveBeenCalled();
  });

  it("never echoes the error message in the response", async () => {
    commandMock.mockRejectedValue(new Error("super secret connection string leaked"));
    const handler = await freshHandler();
    const res = createRes();
    await handler(createMockReq({ method: "GET" }), res);
    expect(JSON.stringify(res.getBody())).not.toContain("secret");
  });

  it("caches the ping outcome for 5s instead of pinging every request", async () => {
    commandMock.mockResolvedValue({ ok: 1 });
    const handler = await freshHandler();

    const first = createRes();
    await handler(createMockReq({ method: "GET" }), first);
    expect(first.getStatus()).toBe(200);
    expect(commandMock).toHaveBeenCalledTimes(1);

    const second = createRes();
    await handler(createMockReq({ method: "GET" }), second);
    expect(second.getStatus()).toBe(200);
    expect(commandMock).toHaveBeenCalledTimes(1);
  });
});
