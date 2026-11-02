import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeLogoStore } from "../helpers/fakeLogoStore";

let db = fakeLogoStore();

vi.mock("mongodb", async (importOriginal) => ({
  Binary: (await importOriginal<typeof import("mongodb")>()).Binary,
  MongoClient: function () {
    return {
      connect: vi.fn(),
      close: vi.fn(),
      db: () => ({
        collection: (name: string) => (name === "room_logos" ? db.logos : db.rooms),
      }),
    };
  },
}));

process.env.MONGODB_URI = "mongodb://test";
process.env.MONGODB_DB = "test-db";

import {
  commitLogo,
  deleteOtherLogos,
  logoHash,
  logoStoreBytes,
  LogoStoreFullError,
  logoUrl,
  MAX_DRAFTS_PER_ROOM,
  pruneOrphanLogos,
  readLogo,
  saveDraftLogo,
  sniffImageType,
} from "../../lib/roomLogos";
import { LOGO_STORE_BUDGET_BYTES } from "../../lib/limits";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const WEBP = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([0x24, 0, 0, 0]),
  Buffer.from("WEBPVP8 "),
]);

describe("sniffImageType", () => {
  it.each([
    ["PNG", PNG, "image/png"],
    ["JPEG", JPEG, "image/jpeg"],
    ["WebP", WEBP, "image/webp"],
  ])("accepts %s", (_name, buf, type) => {
    expect(sniffImageType(buf)).toBe(type);
  });

  it.each([
    ["SVG text", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')],
    ["GIF", Buffer.from("GIF89a\x01\x00\x01\x00")],
    ["empty", Buffer.alloc(0)],
    ["truncated PNG", PNG.subarray(0, 4)],
    ["truncated WebP", WEBP.subarray(0, 10)],
    ["RIFF that isn't WebP", Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE")])],
  ])("rejects %s", (_name, buf) => {
    expect(sniffImageType(buf)).toBeNull();
  });
});

const logosOf = (roomId: string) => db.logos.docs.filter((d) => d.roomId === roomId);

describe("logo store", () => {
  beforeEach(() => {
    db = fakeLogoStore();
  });

  // Must stay first: the index guard runs once per module instance.
  it("creates the draft TTL index and the roomId index once", async () => {
    await logoStoreBytes();
    await logoStoreBytes();

    expect(db.logos.indexes).toEqual([
      { keys: { expireAt: 1 }, options: { expireAfterSeconds: 0 } },
      { keys: { roomId: 1 }, options: undefined },
    ]);
  });

  it("hashes to 16 hex chars and builds an encoded serving URL", () => {
    const hash = logoHash(PNG);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    expect(logoUrl("ROOM1", hash)).toBe(`/api/queue/ROOM1/logo?h=${hash}`);
    expect(logoUrl("A/B?", hash)).toBe(`/api/queue/A%2FB%3F/logo?h=${hash}`);
  });

  it("stores an upload as a 24h draft and reads it back", async () => {
    const hash = await saveDraftLogo("ROOM1", PNG, "image/png");

    const doc = db.logos.docs[0];
    expect(doc._id).toBe(`ROOM1:${hash}`);
    expect(doc).toMatchObject({ roomId: "ROOM1", contentType: "image/png", size: PNG.length });
    const ttl = doc.expireAt.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(23 * 3600_000);
    expect(ttl).toBeLessThanOrEqual(24 * 3600_000);

    const read = await readLogo("ROOM1", hash);
    expect(read?.contentType).toBe("image/png");
    expect(read?.data.equals(PNG)).toBe(true);
    expect(await readLogo("ROOM2", hash)).toBeNull();
  });

  it("refuses an upload past the storage budget and stores nothing", async () => {
    db.logos.insert({ _id: "OTHER:x", roomId: "OTHER", size: LOGO_STORE_BUDGET_BYTES - 4 });

    await expect(saveDraftLogo("ROOM1", PNG, "image/png")).rejects.toBeInstanceOf(
      LogoStoreFullError
    );
    expect(db.logos.docs).toHaveLength(1);
  });

  it("keeps only the newest drafts per room, oldest deleted first, committed logos untouched", async () => {
    db.logos.insert({ _id: "ROOM1:committed", roomId: "ROOM1", size: 1, createdAt: new Date(0) });
    for (let i = 0; i < MAX_DRAFTS_PER_ROOM + 2; i++) {
      await saveDraftLogo("ROOM1", Buffer.concat([PNG, Buffer.from([i])]), "image/png");
    }

    const drafts = db.logos.docs.filter((d) => d.roomId === "ROOM1" && d.expireAt);
    expect(drafts).toHaveLength(MAX_DRAFTS_PER_ROOM);
    const ages = drafts.map((d) => d.createdAt.getTime());
    expect(ages.every((t) => t > 0)).toBe(true);
    expect(db.logos.docs.find((d) => d._id === "ROOM1:committed")).toBeTruthy();
  });

  it("does not count a same-hash re-upload twice", async () => {
    await saveDraftLogo("ROOM1", PNG, "image/png");
    // Full for anything new, but this image is already paid for.
    db.logos.insert({ _id: "OTHER:x", roomId: "OTHER", size: LOGO_STORE_BUDGET_BYTES - PNG.length });

    await expect(saveDraftLogo("ROOM1", PNG, "image/png")).resolves.toBe(logoHash(PNG));
    expect(db.logos.docs).toHaveLength(2);
    expect(await logoStoreBytes()).toBe(LOGO_STORE_BUDGET_BYTES);
  });

  it("commits a draft: no expiry, the room's other committed logos gone, other rooms untouched", async () => {
    const old = await saveDraftLogo("ROOM1", JPEG, "image/jpeg");
    await commitLogo("ROOM1", old);
    const fresh = await saveDraftLogo("ROOM1", PNG, "image/png");
    await saveDraftLogo("ROOM2", WEBP, "image/webp");

    expect(await commitLogo("ROOM1", fresh)).toBe(true);

    const room1 = db.logos.docs.filter((d) => d.roomId === "ROOM1");
    expect(room1.map((d) => d._id)).toEqual([`ROOM1:${fresh}`]);
    expect(room1[0]).not.toHaveProperty("expireAt");
    expect(db.logos.docs.filter((d) => d.roomId === "ROOM2")).toHaveLength(1);
  });

  it("leaves the room's other drafts to their TTL", async () => {
    const otherRail = await saveDraftLogo("ROOM1", JPEG, "image/jpeg");
    const saved = await saveDraftLogo("ROOM1", PNG, "image/png");

    await commitLogo("ROOM1", saved);
    await deleteOtherLogos("ROOM1");

    expect(logosOf("ROOM1").map((d) => d._id)).toEqual([`ROOM1:${otherRail}`]);
    expect(logosOf("ROOM1")[0].expireAt).toBeInstanceOf(Date);
  });

  it("re-uploading the committed logo keeps it committed", async () => {
    const hash = await saveDraftLogo("ROOM1", PNG, "image/png");
    await commitLogo("ROOM1", hash);

    await saveDraftLogo("ROOM1", PNG, "image/png");

    expect(db.logos.docs[0]).not.toHaveProperty("expireAt");
  });

  it("won't commit a hash that was never uploaded to that room", async () => {
    const hash = await saveDraftLogo("ROOM2", PNG, "image/png");

    expect(await commitLogo("ROOM1", hash)).toBe(false);
    expect(await commitLogo("ROOM1", "0123456789abcdef")).toBe(false);
  });

  it("prunes only the logos of rooms that no longer exist", async () => {
    db.rooms.insert({ id: "LIVE1" });
    await saveDraftLogo("LIVE1", PNG, "image/png");
    await saveDraftLogo("GONE1", PNG, "image/png");
    await saveDraftLogo("GONE1", JPEG, "image/jpeg");
    await saveDraftLogo("GONE2", WEBP, "image/webp");

    expect(await pruneOrphanLogos()).toBe(3);
    expect(db.logos.docs.map((d) => d.roomId)).toEqual(["LIVE1"]);
    expect(await pruneOrphanLogos()).toBe(0);
  });
});
