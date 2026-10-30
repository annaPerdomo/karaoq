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

import handler from "../../pages/api/queue/[id]/brand";
import { __resetRateLimits } from "../../lib/limits";
import { commitLogo, saveDraftLogo } from "../../lib/roomLogos";

function createRes() {
  let statusCode = 200;
  let body: unknown = null;
  const res = {
    status(code: number) { statusCode = code; return res; },
    json(data: unknown) { body = data; return res; },
    getStatus: () => statusCode,
    getBody: () => body as any,
  };
  return res as unknown as NextApiResponse & { getStatus: () => number; getBody: () => any };
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 2]);

async function save(body: unknown, roomId = "ROOM1") {
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

const room = () => db.rooms.docs.find((r) => r.id === "ROOM1")!;
const logosOf = (roomId: string) => db.logos.docs.filter((d) => d.roomId === roomId);
const tracked = () => events.insertOne.mock.calls.map((c) => c[0]);

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimits();
  db = fakeLogoStore();
  db.rooms.insert({ id: "ROOM1" });
});

describe("POST /api/queue/[id]/brand - save the room brand", () => {
  it("commits the uploaded logo and writes the brand with a lastActivity bump", async () => {
    const old = await saveDraftLogo("ROOM1", JPEG, "image/jpeg");
    await commitLogo("ROOM1", old);
    room().brand = { logo: old };
    const fresh = await saveDraftLogo("ROOM1", PNG, "image/png");
    await saveDraftLogo("ROOM2", PNG, "image/png");

    const brand = { logo: fresh, accentA: "#ff0080", accentB: "#00ccff" };
    const res = await save({ brand });

    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toEqual({ brand });
    expect(room().brand).toEqual(brand);
    expect(room().lastActivity).toBeInstanceOf(Date);
    expect(logosOf("ROOM1").map((d) => d._id)).toEqual([`ROOM1:${fresh}`]);
    expect(logosOf("ROOM1")[0]).not.toHaveProperty("expireAt");
    expect(logosOf("ROOM2")).toHaveLength(1);
  });

  it("keeps the live logo when only the colours change", async () => {
    const hash = await saveDraftLogo("ROOM1", PNG, "image/png");
    await commitLogo("ROOM1", hash);
    room().brand = { logo: hash };

    const res = await save({ brand: { logo: hash, accentA: "#112233" } });

    expect(res.getStatus()).toBe(200);
    expect(logosOf("ROOM1")).toHaveLength(1);
  });

  it("keeps a draft uploaded on the other rail when this one saves", async () => {
    const hostDraft = await saveDraftLogo("ROOM1", JPEG, "image/jpeg");
    const displayDraft = await saveDraftLogo("ROOM1", PNG, "image/png");

    expect((await save({ brand: { logo: displayDraft } })).getStatus()).toBe(200);

    const draft = logosOf("ROOM1").find((d) => d._id === `ROOM1:${hostDraft}`);
    expect(draft?.expireAt).toBeInstanceOf(Date);
    expect((await save({ brand: { logo: hostDraft } }, "ROOM1")).getStatus()).toBe(200);
    expect(logosOf("ROOM1").map((d) => d._id)).toEqual([`ROOM1:${hostDraft}`]);
  });

  it("re-checks a logo that is already the room's, and 400s when its doc is gone", async () => {
    room().brand = { logo: "0123456789abcdef" };

    const res = await save({ brand: { logo: "0123456789abcdef", accentA: "#112233" } });

    expect(res.getStatus()).toBe(400);
    expect(room().brand).toEqual({ logo: "0123456789abcdef" });
  });

  it("clears a brand that never had a logo, leaving drafts alone", async () => {
    room().brand = { accentA: "#112233" };
    await saveDraftLogo("ROOM1", PNG, "image/png");

    const res = await save({ brand: {} });

    expect(res.getStatus()).toBe(200);
    expect(room().brand).toEqual({});
    expect(logosOf("ROOM1")).toHaveLength(1);
  });

  it("returns 400 for a malformed room code", async () => {
    expect((await save({ brand: {} }, "ROOM-1!")).getStatus()).toBe(400);
  });

  it("returns 400 for a logo hash that was never uploaded", async () => {
    const res = await save({ brand: { logo: "0123456789abcdef" } });

    expect(res.getStatus()).toBe(400);
    expect(room()).not.toHaveProperty("brand");
  });

  it("clears the brand with {} and deletes the room's logos", async () => {
    const hash = await saveDraftLogo("ROOM1", PNG, "image/png");
    await commitLogo("ROOM1", hash);
    room().brand = { logo: hash, accentA: "#112233" };

    const res = await save({ brand: {}, surface: "host" });

    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toEqual({ brand: {} });
    expect(room().brand).toEqual({});
    expect(logosOf("ROOM1")).toHaveLength(0);
    expect(tracked()).toEqual([
      expect.objectContaining({
        type: "brand_saved",
        roomId: "ROOM1",
        logo: false,
        colors: false,
        cleared: true,
        surface: "host",
      }),
    ]);
  });

  it("records brand_saved with the surface, defaulting to display", async () => {
    const hash = await saveDraftLogo("ROOM1", PNG, "image/png");

    await save({ brand: { logo: hash, accentB: "#abcdef" } });

    expect(tracked()).toEqual([
      expect.objectContaining({
        type: "brand_saved",
        logo: true,
        colors: true,
        cleared: false,
        surface: "display",
      }),
    ]);
  });

  it.each([
    ["no brand", {}],
    ["a brand with an unknown key", { brand: { font: "serif" } }],
    ["a bad accent", { brand: { accentA: "#ggg000" } }],
    ["a bad hash", { brand: { logo: "../../etc" } }],
    ["an unknown surface", { brand: {}, surface: "phone" }],
    ["a non-object body", "nope"],
  ])("returns 400 for %s", async (_name, body) => {
    const res = await save(body);

    expect(res.getStatus()).toBe(400);
    expect(room()).not.toHaveProperty("brand");
    expect(tracked()).toEqual([]);
  });

  it("returns 404 for an unknown room", async () => {
    expect((await save({ brand: {} }, "NOPE1")).getStatus()).toBe(404);
  });

  it("rate-limits with 429 after 20 saves a minute", async () => {
    for (let i = 0; i < 20; i++) {
      expect((await save({ brand: {} })).getStatus()).toBe(200);
    }
    expect((await save({ brand: {} })).getStatus()).toBe(429);
  });

  it("rejects non-POST methods with 405", async () => {
    const res = createRes();
    await handler(createMockReq({ method: "GET", query: { id: "ROOM1" } }), res);

    expect(res.getStatus()).toBe(405);
  });
});
