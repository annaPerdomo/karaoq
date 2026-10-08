import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  clearRoomKey,
  getRoomKey,
  parseCohostKeyFragment,
  roomKeyHeaders,
  setRoomKey,
} from "../../lib/roomKeyStore";

describe("roomKeyStore", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips a stored key by code, case-insensitively", () => {
    setRoomKey("abcd", "the-key", "host");
    expect(getRoomKey("ABCD")).toEqual({ key: "the-key", role: "host" });
  });

  it("returns null when nothing is stored", () => {
    expect(getRoomKey("NOPE1")).toBeNull();
  });

  it("clears a stored key", () => {
    setRoomKey("ROOM1", "the-key", "cohost");
    clearRoomKey("ROOM1");
    expect(getRoomKey("ROOM1")).toBeNull();
  });

  it("builds the x-room-key header only when a key is stored", () => {
    expect(roomKeyHeaders("ROOM1")).toEqual({});
    setRoomKey("ROOM1", "the-key", "host");
    expect(roomKeyHeaders("ROOM1")).toEqual({ "x-room-key": "the-key" });
  });
});

describe("roomKeyStore with a throwing localStorage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to an in-memory store for the page session", () => {
    setRoomKey("ROOM1", "the-key", "host");
    expect(getRoomKey("ROOM1")).toEqual({ key: "the-key", role: "host" });
  });

  it("clears the in-memory fallback too", () => {
    setRoomKey("ROOM1", "the-key", "host");
    clearRoomKey("ROOM1");
    expect(getRoomKey("ROOM1")).toBeNull();
  });
});

describe("parseCohostKeyFragment", () => {
  it("extracts the key from a #k= fragment", () => {
    expect(parseCohostKeyFragment("#k=abc123")).toBe("abc123");
  });

  it("returns null for a hash with no key", () => {
    expect(parseCohostKeyFragment("")).toBeNull();
    expect(parseCohostKeyFragment("#other=1")).toBeNull();
  });
});
