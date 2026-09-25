import { randomBytes, createHash, timingSafeEqual } from "crypto";
import type { NextApiRequest } from "next";
import { Room } from "../pages/api/types";

export type RoomKeyRole = "host" | "cohost" | "display";

export function roomKeyFromRequest(req: NextApiRequest): string | undefined {
  const header = req.headers["x-room-key"];
  return Array.isArray(header) ? header[0] : header;
}

export function mintRoomKey(): string {
  return randomBytes(32).toString("base64url");
}

export function hashRoomKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function hashesEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export function isLegacyRoom(room: Pick<Room, "keys">): boolean {
  return !room.keys || room.keys.length === 0;
}

export function roleForKey(
  room: Pick<Room, "keys">,
  key: string | undefined
): RoomKeyRole | null {
  if (!key) return null;
  const hash = hashRoomKey(key);
  const match = (room.keys ?? []).find((k) => hashesEqual(k.hash, hash));
  return match ? match.role : null;
}

export function allows(
  room: Pick<Room, "keys">,
  key: string | undefined,
  roles: RoomKeyRole[]
): boolean {
  if (isLegacyRoom(room)) return true;
  const role = roleForKey(room, key);
  return role !== null && roles.includes(role);
}

export function publicRoom<T extends { keys?: unknown }>(room: T): Omit<T, "keys"> {
  const { keys: _keys, ...rest } = room;
  return rest;
}
