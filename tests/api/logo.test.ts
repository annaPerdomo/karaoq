import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextApiResponse } from "next";
import { createMockReq } from "../helpers/mockRequest";
import { fakeLogoStore } from "../helpers/fakeLogoStore";

let db = fakeLogoStore();
const events = { insertOne: vi.fn(), createIndex: vi.fn(async () => "ok") };

vi.mock("mongodb", async (importOriginal) => ({
  Binary: (await importOriginal<typeof import("mongodb")>()).Binary,
  MongoClient: function () {
    return {
      connect: vi.fn(),
      close: vi.fn(),
      db: () => ({
        collection: (name: string) =>
          name === "room_logos" ? db.logos : name === "rooms" ? db.rooms : events,
      }),
    };
  },
}));

process.env.MONGODB_URI = "mongodb://test";
process.env.MONGODB_DB = "test-db";

import handler, { config } from "../../pages/api/queue/[id]/logo";
import { __resetRateLimits, LOGO_MAX_BYTES, LOGO_STORE_BUDGET_BYTES } from "../../lib/limits";
import { logoHash } from "../../lib/roomLogos";

function createRes() {
  let statusCode = 200;
  let body: unknown = null;
  const headers: Record<string, string> = {};
  const res = {
    status(code: number) { statusCode = code; return res; },
    json(data: unknown) { body = data; return res; },
    send(data: unknown) { body = data; return res; },
    setHeader(name: string, value: string) { headers[name] = value; return res; },
    getStatus: () => statusCode,
    getBody: () => body as any,
    getHeaders: () => headers,
  };
  return res as unknown as NextApiResponse & {
    getStatus: () => number;
    getBody: () => any;
    getHeaders: () => Record<string, string>;
  };
}

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("IHDR-ish payload"),
]);

function dataUrl(buf: Buffer, type = "image/png"): string {
  return `data:${type};base64,${buf.toString("base64")}`;
}

async function upload(body: unknown, roomId = "ROOM1") {
  const req = createMockReq({
    method: "POST",
    query: { id: roomId },
    // A production host — localhost would be analytics-exempt.
    headers: { host: "karaoq.live" },
    body,
  });
  const res = createRes();
  await handler(req, res);
  return res;
}

async function fetchLogo(h: string | undefined, roomId = "ROOM1") {
  const req = createMockReq({ method: "GET", query: { id: roomId, ...(h === undefined ? {} : { h }) } });
  const res = createRes();
  await handler(req, res);
  return res;
}

const tracked = () => events.insertOne.mock.calls.map((c) => c[0]);

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimits();
  db = fakeLogoStore();
  db.rooms.insert({ id: "ROOM1" });
});

describe("POST /api/queue/[id]/logo - upload a draft logo", () => {
  it("raises the body limit past the 64 KB logo", () => {
    expect(config.api.bodyParser.sizeLimit).toBe("400kb");
  });

  it("stores a draft with an expiry and returns its hash and URL", async () => {
    const res = await upload({ dataUrl: dataUrl(PNG) });

    const hash = logoHash(PNG);
    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toEqual({ hash, url: `/api/queue/ROOM1/logo?h=${hash}` });
    expect(db.logos.docs).toHaveLength(1);
    expect(db.logos.docs[0]).toMatchObject({
      _id: `ROOM1:${hash}`,
      roomId: "ROOM1",
      contentType: "image/png",
      size: PNG.length,
      expireAt: expect.any(Date),
    });
    expect(tracked()).toEqual([
      expect.objectContaining({ type: "logo_uploaded", roomId: "ROOM1", bytes: PNG.length }),
    ]);
  });

  it("stores the sniffed type, not the declared one", async () => {
    await upload({ dataUrl: dataUrl(PNG, "image/webp") });

    expect(db.logos.docs[0].contentType).toBe("image/png");
  });

  it("rejects an oversize image with 413", async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(LOGO_MAX_BYTES)]);
    const res = await upload({ dataUrl: dataUrl(big) });

    expect(res.getStatus()).toBe(413);
    expect(db.logos.docs).toHaveLength(0);
    expect(tracked()).toEqual([
      expect.objectContaining({ type: "logo_upload_rejected", reason: "size" }),
    ]);
  });

  it("rejects an SVG labelled image/png with 400", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
    const res = await upload({ dataUrl: dataUrl(svg, "image/png") });

    expect(res.getStatus()).toBe(400);
    expect(db.logos.docs).toHaveLength(0);
    expect(tracked()).toEqual([
      expect.objectContaining({ type: "logo_upload_rejected", reason: "type" }),
    ]);
  });

  it.each([{}, { dataUrl: 42 }, { dataUrl: "https://example.com/logo.png" }, "nope"])(
    "rejects a malformed body %j with 400",
    async (body) => {
      const res = await upload(body);

      expect(res.getStatus()).toBe(400);
      expect(db.logos.docs).toHaveLength(0);
    }
  );

  it("returns 404 for an unknown room", async () => {
    const res = await upload({ dataUrl: dataUrl(PNG) }, "NOPE1");

    expect(res.getStatus()).toBe(404);
    expect(db.logos.docs).toHaveLength(0);
  });

  it("answers 507 storage_full past the budget and stores nothing", async () => {
    db.logos.insert({ _id: "OTHER:x", roomId: "OTHER", size: LOGO_STORE_BUDGET_BYTES });

    const res = await upload({ dataUrl: dataUrl(PNG) });

    expect(res.getStatus()).toBe(507);
    expect(res.getBody()).toEqual({ error: "storage_full" });
    expect(db.logos.docs).toHaveLength(1);
    expect(tracked()).toEqual([
      expect.objectContaining({ type: "logo_upload_rejected", reason: "storage_full" }),
    ]);
  });

  it("rate-limits with 429 after 10 uploads a minute", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await upload({ dataUrl: dataUrl(PNG) })).getStatus()).toBe(200);
    }
    expect((await upload({ dataUrl: dataUrl(PNG) })).getStatus()).toBe(429);
  });

  it("returns 400 for a malformed room code", async () => {
    expect((await upload({ dataUrl: dataUrl(PNG) }, "../x")).getStatus()).toBe(400);
    expect((await fetchLogo(logoHash(PNG), "R")).getStatus()).toBe(400);
  });

  it("rejects other methods with 405", async () => {
    const res = createRes();
    await handler(createMockReq({ method: "DELETE", query: { id: "ROOM1" } }), res);

    expect(res.getStatus()).toBe(405);
  });
});

describe("GET /api/queue/[id]/logo - serve a logo", () => {
  it("serves the bytes with immutable caching and a locked-down CSP", async () => {
    const { hash } = (await upload({ dataUrl: dataUrl(PNG) })).getBody();

    const res = await fetchLogo(hash);

    expect(res.getStatus()).toBe(200);
    expect(Buffer.isBuffer(res.getBody()) && res.getBody().equals(PNG)).toBe(true);
    expect(res.getHeaders()).toEqual({
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    });
  });

  it("returns 404 for an unknown hash, and for another room's logo", async () => {
    const { hash } = (await upload({ dataUrl: dataUrl(PNG) })).getBody();

    expect((await fetchLogo("0123456789abcdef")).getStatus()).toBe(404);
    expect((await fetchLogo(hash, "ROOM2")).getStatus()).toBe(404);
  });

  it.each([undefined, "", "XYZ", "0123456789ABCDEF", "0123456789abcdef0"])(
    "returns 400 for a malformed hash %j",
    async (h) => {
      expect((await fetchLogo(h)).getStatus()).toBe(400);
    }
  );
});
