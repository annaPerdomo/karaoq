import { createHash } from "crypto";
import { Binary } from "mongodb";
import { LOGO_STORE_BUDGET_BYTES } from "./limits";
import { getRoomLogosCollection, getRoomsCollection } from "./mongodb";

export { logoUrl } from "./logoUrl";

export type LogoContentType = "image/png" | "image/jpeg" | "image/webp";

// An upload is a draft until the brand is saved, so Discard never touches the
// live logo; an abandoned draft is gone by itself through the TTL index.
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export class LogoStoreFullError extends Error {
  constructor() {
    super("Logo storage budget is spent.");
    this.name = "LogoStoreFullError";
  }
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

function startsWith(buf: Buffer, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buf[offset + i] === b);
}

function ascii(s: string): number[] {
  return s.split("").map((c) => c.charCodeAt(0));
}

/** Magic bytes only — a declared type is never trusted, which is what keeps
 *  SVG (and the scripts it can carry) out. */
export function sniffImageType(buf: Buffer): LogoContentType | null {
  if (startsWith(buf, PNG_MAGIC)) return "image/png";
  if (startsWith(buf, JPEG_MAGIC)) return "image/jpeg";
  if (startsWith(buf, ascii("RIFF")) && startsWith(buf, ascii("WEBP"), 8)) return "image/webp";
  return null;
}

export function logoHash(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

function logoId(roomId: string, hash: string): string {
  return `${roomId}:${hash}`;
}

export async function logoStoreBytes(): Promise<number> {
  const collection = await getRoomLogosCollection();
  const [row] = await collection
    .aggregate<{ total: number }>([{ $group: { _id: null, total: { $sum: "$size" } } }])
    .toArray();
  return row?.total ?? 0;
}

export async function saveDraftLogo(
  roomId: string,
  buf: Buffer,
  contentType: string
): Promise<string> {
  const hash = logoHash(buf);
  const _id = logoId(roomId, hash);
  const collection = await getRoomLogosCollection();
  const expireAt = new Date(Date.now() + DRAFT_TTL_MS);

  // Re-uploading the committed logo must not put an expiry back on it.
  const existing = await collection.findOne({ _id }, { projection: { expireAt: 1 } });
  if (existing) {
    if (existing.expireAt) {
      await collection.updateOne({ _id, expireAt: { $exists: true } }, { $set: { expireAt } });
    }
    return hash;
  }

  if ((await logoStoreBytes()) + buf.length > LOGO_STORE_BUDGET_BYTES) {
    throw new LogoStoreFullError();
  }

  await collection.updateOne(
    { _id },
    {
      $setOnInsert: {
        roomId,
        contentType,
        size: buf.length,
        data: new Binary(buf),
        createdAt: new Date(),
        expireAt,
      },
    },
    { upsert: true }
  );
  return hash;
}

/** Drops the logo's draft expiry; false when it was never uploaded or has expired. */
export async function confirmLogo(roomId: string, hash: string): Promise<boolean> {
  const collection = await getRoomLogosCollection();
  const result = await collection.updateOne(
    { _id: logoId(roomId, hash), roomId },
    { $unset: { expireAt: "" } }
  );
  return result.matchedCount > 0;
}

/** A room keeps one committed logo. Drafts are left to their TTL, so a draft
 *  open on the other Customize rail survives this save. */
export async function deleteOtherLogos(roomId: string, keepHash?: string): Promise<void> {
  const collection = await getRoomLogosCollection();
  await collection.deleteMany({
    roomId,
    expireAt: { $exists: false },
    ...(keepHash ? { _id: { $ne: logoId(roomId, keepHash) } } : {}),
  });
}

export async function commitLogo(roomId: string, hash: string): Promise<boolean> {
  if (!(await confirmLogo(roomId, hash))) return false;
  await deleteOtherLogos(roomId, hash);
  return true;
}

export async function readLogo(
  roomId: string,
  hash: string
): Promise<{ contentType: string; data: Buffer } | null> {
  const collection = await getRoomLogosCollection();
  const doc = await collection.findOne({ _id: logoId(roomId, hash) });
  if (!doc) return null;
  return { contentType: doc.contentType, data: Buffer.from(doc.data.buffer) };
}

export async function pruneOrphanLogos(): Promise<number> {
  const logos = await getRoomLogosCollection();
  const roomIds = await logos.distinct("roomId", {}, { maxTimeMS: 10_000 });
  if (roomIds.length === 0) return 0;
  const rooms = await getRoomsCollection();
  const live = await rooms
    .find({ id: { $in: roomIds } }, { projection: { _id: 0, id: 1 }, maxTimeMS: 10_000 })
    .toArray();
  const liveIds = new Set(live.map((r) => r.id));
  const orphans = roomIds.filter((id) => !liveIds.has(id));
  if (orphans.length === 0) return 0;
  const result = await logos.deleteMany({ roomId: { $in: orphans } }, { maxTimeMS: 10_000 });
  return result.deletedCount;
}
