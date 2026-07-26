import { describe, it, expect } from "vitest";
import { reorderSections } from "../../components/edit/hooks/useSectionReorder";

type S = "qr" | "welcome" | "upNext" | "boards";

const ORDER: S[] = ["qr", "welcome", "upNext", "boards"];
const allVisible: Record<S, boolean> = {
  qr: true,
  welcome: true,
  upNext: true,
  boards: true,
};

describe("reorderSections", () => {
  it("leaves the order alone when nothing has been passed", () => {
    expect(reorderSections(ORDER, allVisible, "qr", [])).toEqual(ORDER);
  });

  it("drops the lifted section after the sections it has cleared", () => {
    expect(reorderSections(ORDER, allVisible, "qr", ["welcome", "upNext"])).toEqual([
      "welcome",
      "upNext",
      "qr",
      "boards",
    ]);
  });

  it("pulls a section to the top when it has cleared nothing", () => {
    expect(reorderSections(ORDER, allVisible, "boards", [])).toEqual([
      "boards",
      "qr",
      "welcome",
      "upNext",
    ]);
  });

  // Regression: hidden sections used to teleport to the tail on every drag.
  it("keeps a hidden section in the slot it already holds", () => {
    const visible = { ...allVisible, welcome: false };
    expect(reorderSections(ORDER, visible, "qr", ["upNext"])).toEqual([
      "upNext",
      "welcome",
      "qr",
      "boards",
    ]);
  });

  it("does not move hidden sections when the drag changes nothing", () => {
    const visible = { ...allVisible, welcome: false };
    expect(reorderSections(ORDER, visible, "qr", [])).toEqual(ORDER);
  });

  it("always returns a permutation, which the endpoint's validator requires", () => {
    const visible = { ...allVisible, welcome: false, boards: false };
    for (const id of ORDER) {
      for (const above of [[], ["qr"], ["upNext"], ["qr", "upNext"]] as S[][]) {
        const next = reorderSections(ORDER, visible, id, above);
        expect(next.length).toBe(ORDER.length);
        expect(new Set(next).size).toBe(ORDER.length);
        expect([...next].sort()).toEqual([...ORDER].sort());
      }
    }
  });
});
