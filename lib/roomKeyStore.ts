import type { RoomKeyRole } from "./roomKeys";

const KEY_PREFIX = "karaoq_room_key_";

export interface StoredRoomKey {
  key: string;
  role: RoomKeyRole;
}

function storageKey(code: string): string {
  return `${KEY_PREFIX}${code.toUpperCase()}`;
}

// A throwing localStorage (private browsing, quota, some in-app browsers)
// must not lock the creator out for the rest of the tab's life.
const memoryFallback = new Map<string, string>();

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return memoryFallback.get(key) ?? null;
  }
}

function writeRaw(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    memoryFallback.set(key, value);
  }
}

function removeRaw(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    memoryFallback.delete(key);
  }
}

export function getRoomKey(code: string): StoredRoomKey | null {
  if (typeof window === "undefined") return null;
  const raw = readRaw(storageKey(code));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredRoomKey;
    return typeof parsed?.key === "string" && typeof parsed?.role === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export function setRoomKey(code: string, key: string, role: RoomKeyRole): void {
  if (typeof window === "undefined") return;
  writeRaw(storageKey(code), JSON.stringify({ key, role } satisfies StoredRoomKey));
}

export function clearRoomKey(code: string): void {
  if (typeof window === "undefined") return;
  removeRaw(storageKey(code));
}

const COHOST_LINK_KEY_PREFIX = "karaoq_cohost_link_key_";

/** The co-host key embedded in the invite link/QR — cached separately from
 * this device's own role so re-opening the invite doesn't re-mint. */
export function getCohostLinkKey(code: string): string | null {
  if (typeof window === "undefined") return null;
  return readRaw(`${COHOST_LINK_KEY_PREFIX}${code.toUpperCase()}`);
}

export function setCohostLinkKey(code: string, key: string): void {
  if (typeof window === "undefined") return;
  writeRaw(`${COHOST_LINK_KEY_PREFIX}${code.toUpperCase()}`, key);
}

export function clearCohostLinkKey(code: string): void {
  if (typeof window === "undefined") return;
  removeRaw(`${COHOST_LINK_KEY_PREFIX}${code.toUpperCase()}`);
}

/** The co-host key rides the invite link's URL fragment (`#k=...`) so it never
 * reaches a server log or referrer; the caller stores it and scrubs the hash. */
export function parseCohostKeyFragment(hash: string): string | null {
  const match = hash.match(/^#k=(.+)$/);
  return match ? match[1] : null;
}

export function roomKeyHeaders(code: string): Record<string, string> {
  const stored = getRoomKey(code);
  return stored ? { "x-room-key": stored.key } : {};
}

// Lets a gated fetch that hits 403 tell the host page its stored key was
// revoked or cleared, without every call site threading the result through.
const rejectionListeners = new Map<string, Set<() => void>>();

export function notifyRoomKeyRejected(code: string): void {
  rejectionListeners.get(code.toUpperCase())?.forEach((cb) => cb());
}

export function onRoomKeyRejected(code: string, cb: () => void): () => void {
  const key = code.toUpperCase();
  const set = rejectionListeners.get(key) ?? new Set();
  set.add(cb);
  rejectionListeners.set(key, set);
  return () => set.delete(cb);
}
