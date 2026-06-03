import { describe, it, expect } from "vitest";
import { normalizeRoomId } from "../../lib/roomCode";

describe("normalizeRoomId", () => {
  it("uppercases a lowercase string", () => {
    expect(normalizeRoomId("abcd")).toBe("ABCD");
  });

  it("uppercases a mixed-case string", () => {
    expect(normalizeRoomId("aB3d")).toBe("AB3D");
  });

  it("leaves an already-uppercase string unchanged", () => {
    expect(normalizeRoomId("ABCD")).toBe("ABCD");
  });

  it("passes an array through untouched for caller validation", () => {
    const arr = ["abcd", "efgh"];
    expect(normalizeRoomId(arr)).toBe(arr);
  });

  it("passes undefined through untouched", () => {
    expect(normalizeRoomId(undefined)).toBeUndefined();
  });
});
