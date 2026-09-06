import { describe, it, expect } from "vitest";
import {
  GUIDES,
  GUIDE_SLUGS,
  firstSponsoredPlacement,
  hasInlinePlacements,
  indices,
  placedItemIndices,
  unplacedItemIndices,
  type Guide,
} from "../../lib/guides";

// A minimal guide to exercise placement shapes the shipped catalog doesn't
// have yet — mixed paid/unpaid links, out-of-range keys, nothing placed.
function guide(over: Partial<Guide> = {}): Guide {
  return {
    id: "t",
    slug: "t",
    related: [],
    sectionCount: 3,
    stepCount: 3,
    faqCount: 0,
    published: "2026-01-01",
    updated: "2026-01-01",
    ...over,
  };
}

describe("guide item placement", () => {
  it("keys every placement to a section or step the article renders", () => {
    for (const g of GUIDES) {
      for (const n of Object.keys(g.sectionItems ?? {}).map(Number)) {
        expect(n, `${g.id}.sectionItems[${n}]`).toBeGreaterThanOrEqual(1);
        expect(n, `${g.id}.sectionItems[${n}]`).toBeLessThanOrEqual(g.sectionCount);
      }
      for (const n of Object.keys(g.stepItems ?? {}).map(Number)) {
        expect(n, `${g.id}.stepItems[${n}]`).toBeGreaterThanOrEqual(1);
        expect(n, `${g.id}.stepItems[${n}]`).toBeLessThanOrEqual(g.stepCount);
      }
      if (g.demoStep !== undefined) {
        expect(g.demoStep, `${g.id}.demoStep`).toBeGreaterThanOrEqual(1);
        expect(g.demoStep, `${g.id}.demoStep`).toBeLessThanOrEqual(g.stepCount);
      }
    }
  });

  it("shows every item exactly once — inline or in the foot list", () => {
    for (const g of GUIDES) {
      const inline = [
        ...indices(g.sectionCount).flatMap((n) => placedItemIndices(g, "section", n)),
        ...indices(g.stepCount).flatMap((n) => placedItemIndices(g, "step", n)),
      ];
      const shown = [...inline, ...unplacedItemIndices(g)].sort((a, b) => a - b);
      expect(shown, g.id).toEqual(indices((g.items ?? []).length));
    }
  });

  it("falls back to the foot list for an item keyed past the last section", () => {
    const g = guide({
      items: [{ href: "https://example.com/a" }, { href: "https://example.com/b" }],
      sectionCount: 1,
      stepCount: 0,
      sectionItems: { 1: [1], 5: [2] },
    });
    expect(unplacedItemIndices(g)).toEqual([2]);
  });
});

describe("affiliate disclosure placement", () => {
  it("picks the first sponsored group, not the first group", () => {
    const g = guide({
      items: [
        { href: "https://youtube.com/x" },
        { href: "https://amazon.com/y", sponsored: true },
      ],
      sectionItems: { 2: [1], 3: [2] },
    });
    expect(firstSponsoredPlacement(g)).toEqual({ where: "section", n: 3 });
  });

  it("reads sections before steps", () => {
    const g = guide({
      items: [{ href: "https://amazon.com/y", sponsored: true }, { href: "https://amazon.com/z", sponsored: true }],
      sectionItems: { 3: [1] },
      stepItems: { 1: [2] },
    });
    expect(firstSponsoredPlacement(g)).toEqual({ where: "section", n: 3 });
  });

  it("ignores a sponsored group keyed past the last step", () => {
    const g = guide({
      items: [{ href: "https://amazon.com/y", sponsored: true }],
      stepCount: 2,
      stepItems: { 9: [1] },
    });
    expect(firstSponsoredPlacement(g)).toBeNull();
    expect(unplacedItemIndices(g)).toEqual([1]);
  });

  it("leaves the disclosure to the foot list when nothing sponsored is inline", () => {
    const g = guide({
      items: [{ href: "https://youtube.com/x" }, { href: "https://amazon.com/y", sponsored: true }],
      sectionItems: { 1: [1] },
    });
    expect(firstSponsoredPlacement(g)).toBeNull();
    expect(unplacedItemIndices(g)).toEqual([2]);
  });

  it("discloses somewhere on every shipped guide that carries a paid link", () => {
    for (const g of GUIDES) {
      if (!(g.items ?? []).some((i) => i.sponsored)) continue;
      const inlineDisclosure = firstSponsoredPlacement(g) !== null;
      const footDisclosure = unplacedItemIndices(g).some((n) => g.items?.[n - 1]?.sponsored);
      expect(inlineDisclosure || footDisclosure, g.id).toBe(true);
    }
  });
});

describe("guide catalog", () => {
  it("has unique slugs and ids", () => {
    expect(new Set(GUIDE_SLUGS).size).toBe(GUIDE_SLUGS.length);
    expect(new Set(GUIDES.map((g) => g.id)).size).toBe(GUIDES.length);
  });

  it("marks the guides whose items are all placed inline", () => {
    for (const g of GUIDES) {
      expect(hasInlinePlacements(g)).toBe(
        Object.keys({ ...g.sectionItems, ...g.stepItems }).length > 0
      );
    }
  });
});
