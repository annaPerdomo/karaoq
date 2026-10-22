import { describe, it, expect } from "vitest";
import { fakeCollection } from "./fakeCollection";

// Exercises the $expr operators lib/corpusPromote's candidate query needs
// ($add, $setUnion, $map, $objectToArray) — added here rather than copied,
// since matchesExpr now shares aggValue with the aggregation pipeline below.
describe("fakeCollection $expr", () => {
  it("adds two fields before comparing", async () => {
    const c = fakeCollection();
    c.seed({ _id: "a", rooms: 2, searchRooms: 1 });
    c.seed({ _id: "b", rooms: 1, searchRooms: 0 });

    const rows = await c
      .find({
        $expr: {
          $gte: [{ $add: ["$rooms", { $ifNull: ["$searchRooms", 0] }] }, 3],
        },
      })
      .toArray();

    expect(rows.map((r) => r._id)).toEqual(["a"]);
  });

  it("counts the union of two maps' keys", async () => {
    const c = fakeCollection();
    c.seed({ _id: "a", addsByCountry: { PH: 1 }, searchesByCountry: { DE: 1 } });
    c.seed({ _id: "b", addsByCountry: { PH: 1 }, searchesByCountry: {} });

    const keysOf = (field: string) => ({
      $map: { input: { $objectToArray: { $ifNull: [field, {}] } }, in: "$$this.k" },
    });
    const rows = await c
      .find({
        $expr: {
          $gte: [
            { $size: { $setUnion: [keysOf("$addsByCountry"), keysOf("$searchesByCountry")] } },
            2,
          ],
        },
      })
      .toArray();

    expect(rows.map((r) => r._id)).toEqual(["a"]);
  });
});

describe("fakeCollection numeric array index", () => {
  it("reads 'field.0' as the literal element, so $exists tells empty from non-empty", async () => {
    const c = fakeCollection();
    c.seed({ _id: "has-cuts", cuts: ["v1"] });
    c.seed({ _id: "no-cuts", cuts: [] });

    const rows = await c.find({ "cuts.0": { $exists: true } }).toArray();

    expect(rows.map((r) => r._id)).toEqual(["has-cuts"]);
  });
});
