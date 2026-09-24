import { describe, it, expect } from "vitest";
import { isBackKey, navDirFromKey, pickNext, NavRect } from "../../lib/spatialNav";

function rect(left: number, top: number, size = 100): NavRect {
  return { left, top, width: size, height: size };
}

const GRID = [
  { id: "a", rect: rect(0, 0) },
  { id: "b", rect: rect(100, 0) },
  { id: "c", rect: rect(200, 0) },
  { id: "d", rect: rect(0, 100) },
  { id: "e", rect: rect(100, 100) },
  { id: "f", rect: rect(200, 100) },
  { id: "g", rect: rect(0, 200) },
  { id: "h", rect: rect(100, 200) },
  { id: "i", rect: rect(200, 200) },
];

const CENTER = GRID[4].rect;
const others = GRID.filter((c) => c.id !== "e");

describe("pickNext", () => {
  it("picks the neighbor in each direction from the grid center", () => {
    expect(pickNext(CENTER, others, "up")).toBe("b");
    expect(pickNext(CENTER, others, "down")).toBe("h");
    expect(pickNext(CENTER, others, "left")).toBe("d");
    expect(pickNext(CENTER, others, "right")).toBe("f");
  });

  it("prefers an aligned farther candidate over a closer off-axis one", () => {
    const from = rect(0, 0, 10);
    const aligned = { id: "aligned", rect: rect(100, 0, 10) };
    const offAxis = { id: "off-axis", rect: rect(60, 40, 10) };
    expect(pickNext(from, [aligned, offAxis], "right")).toBe("aligned");
  });

  it("returns null when nothing lies in the given direction", () => {
    const from = rect(200, 200, 10);
    const candidates = [{ id: "a", rect: rect(0, 0, 10) }];
    expect(pickNext(from, candidates, "right")).toBeNull();
  });

  it("breaks ties by picking the first candidate in the array", () => {
    const from = rect(0, 0, 10);
    const candidates = [
      { id: "first", rect: rect(100, 0, 10) },
      { id: "second", rect: rect(100, 0, 10) },
    ];
    expect(pickNext(from, candidates, "right")).toBe("first");
  });
});

describe("navDirFromKey", () => {
  it("reads arrow key names", () => {
    expect(navDirFromKey({ key: "ArrowUp" })).toBe("up");
    expect(navDirFromKey({ key: "ArrowDown" })).toBe("down");
    expect(navDirFromKey({ key: "ArrowLeft" })).toBe("left");
    expect(navDirFromKey({ key: "ArrowRight" })).toBe("right");
  });

  it("falls back to legacy keyCodes 37-40", () => {
    expect(navDirFromKey({ key: "", keyCode: 37 })).toBe("left");
    expect(navDirFromKey({ key: "", keyCode: 38 })).toBe("up");
    expect(navDirFromKey({ key: "", keyCode: 39 })).toBe("right");
    expect(navDirFromKey({ key: "", keyCode: 40 })).toBe("down");
  });

  it("returns null for anything else", () => {
    expect(navDirFromKey({ key: "Enter" })).toBeNull();
  });
});

describe("isBackKey", () => {
  it("is true for Tizen, webOS, and Escape", () => {
    expect(isBackKey({ key: "", keyCode: 10009 })).toBe(true);
    expect(isBackKey({ key: "", keyCode: 461 })).toBe(true);
    expect(isBackKey({ key: "Escape" })).toBe(true);
    expect(isBackKey({ key: "GoBack" })).toBe(true);
    expect(isBackKey({ key: "BrowserBack" })).toBe(true);
  });

  it("is false for Backspace", () => {
    expect(isBackKey({ key: "Backspace", keyCode: 8 })).toBe(false);
  });
});
