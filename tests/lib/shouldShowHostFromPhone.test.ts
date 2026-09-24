import { describe, it, expect } from "vitest";
import { shouldShowHostFromPhone } from "../../lib/shouldShowHostFromPhone";

const BASE = { startedHere: true, hidden: false, editing: false, playing: false };

describe("shouldShowHostFromPhone", () => {
  it("shows when every condition holds", () => {
    expect(shouldShowHostFromPhone(BASE)).toBe(true);
  });

  it("hides when this TV did not start the room", () => {
    expect(shouldShowHostFromPhone({ ...BASE, startedHere: false })).toBe(false);
  });

  it("hides when dismissed", () => {
    expect(shouldShowHostFromPhone({ ...BASE, hidden: true })).toBe(false);
  });

  it("hides while customizing", () => {
    expect(shouldShowHostFromPhone({ ...BASE, editing: true })).toBe(false);
  });

  it("hides while something is playing", () => {
    expect(shouldShowHostFromPhone({ ...BASE, playing: true })).toBe(false);
  });
});
