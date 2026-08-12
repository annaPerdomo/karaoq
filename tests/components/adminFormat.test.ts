import { describe, it, expect } from "vitest";
import { lookupOutcomeParts } from "../../components/admin/format";

describe("lookupOutcomeParts", () => {
  it("orders outcomes the same way regardless of aggregation order", () => {
    expect(
      lookupOutcomeParts([
        { _id: "not_embeddable", count: 1 },
        { _id: "hit", count: 38 },
        { _id: "not_found", count: 3 },
      ])
    ).toEqual(["38 found", "3 bad link", "1 blocked"]);
  });

  it("drops outcomes nobody hit", () => {
    expect(lookupOutcomeParts([{ _id: "hit", count: 5 }])).toEqual(["5 found"]);
    expect(lookupOutcomeParts([])).toEqual([]);
  });

  it("shows an unrecognised outcome rather than swallowing it", () => {
    expect(
      lookupOutcomeParts([
        { _id: "hit", count: 2 },
        { _id: "something_new", count: 1 },
      ])
    ).toEqual(["2 found", "1 something_new"]);
  });
});
