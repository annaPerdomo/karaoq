import { describe, it, expect } from "vitest";
import {
  allows,
  hashRoomKey,
  isLegacyRoom,
  mintRoomKey,
  publicRoom,
  roleForKey,
} from "../../lib/roomKeys";
import { Room } from "../../pages/api/types";

function roomWithKeys(keys: Room["keys"]): Pick<Room, "keys"> {
  return { keys };
}

describe("mintRoomKey", () => {
  it("mints a unique 43-character base64url key", () => {
    const a = mintRoomKey();
    const b = mintRoomKey();
    expect(a).not.toBe(b);
    expect(a).toHaveLength(43);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("hashRoomKey", () => {
  it("is stable for the same input", () => {
    const key = mintRoomKey();
    expect(hashRoomKey(key)).toBe(hashRoomKey(key));
  });

  it("differs for different inputs", () => {
    expect(hashRoomKey("a")).not.toBe(hashRoomKey("b"));
  });
});

describe("roleForKey", () => {
  const hostKey = "host-key";
  const cohostKey = "cohost-key";
  const displayKey = "display-key";
  const room = roomWithKeys([
    { hash: hashRoomKey(hostKey), role: "host", createdAt: new Date() },
    { hash: hashRoomKey(cohostKey), role: "cohost", createdAt: new Date() },
    { hash: hashRoomKey(displayKey), role: "display", createdAt: new Date() },
  ]);

  it("returns the matching role for each key", () => {
    expect(roleForKey(room, hostKey)).toBe("host");
    expect(roleForKey(room, cohostKey)).toBe("cohost");
    expect(roleForKey(room, displayKey)).toBe("display");
  });

  it("returns null for a wrong key", () => {
    expect(roleForKey(room, "nope")).toBeNull();
  });

  it("returns null for an undefined key", () => {
    expect(roleForKey(room, undefined)).toBeNull();
  });
});

describe("isLegacyRoom / allows", () => {
  it("treats a room with no keys as legacy, allowing everything", () => {
    const room = roomWithKeys(undefined);
    expect(isLegacyRoom(room)).toBe(true);
    expect(allows(room, undefined, ["host"])).toBe(true);
    expect(allows(room, "anything", ["display"])).toBe(true);
  });

  it("treats a room with an empty keys array as legacy", () => {
    const room = roomWithKeys([]);
    expect(isLegacyRoom(room)).toBe(true);
    expect(allows(room, undefined, ["host"])).toBe(true);
  });

  it("requires a matching role once the room is keyed", () => {
    const hostKey = "host-key";
    const room = roomWithKeys([
      { hash: hashRoomKey(hostKey), role: "host", createdAt: new Date() },
    ]);
    expect(isLegacyRoom(room)).toBe(false);
    expect(allows(room, hostKey, ["host", "cohost"])).toBe(true);
    expect(allows(room, hostKey, ["cohost"])).toBe(false);
    expect(allows(room, undefined, ["host"])).toBe(false);
  });
});

describe("publicRoom", () => {
  it("strips keys from the response shape", () => {
    const room = { id: "ROOM1", keys: [{ hash: "x", role: "host" as const, createdAt: new Date() }] };
    const stripped = publicRoom(room);
    expect(stripped).not.toHaveProperty("keys");
    expect(stripped.id).toBe("ROOM1");
  });
});
