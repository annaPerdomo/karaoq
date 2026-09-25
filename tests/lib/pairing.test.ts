import { describe, it, expect } from "vitest";
import { formatPairCode, isPairCode, newPairCode, PAIR_TTL_MS } from "../../lib/pairing";

describe("newPairCode", () => {
  it("returns a 6-digit string for a screen pairing, zero-padded", () => {
    for (let i = 0; i < 50; i++) {
      expect(newPairCode("screen")).toMatch(/^\d{6}$/);
    }
  });

  it("returns an 8-digit string for a remote pairing, zero-padded", () => {
    for (let i = 0; i < 50; i++) {
      expect(newPairCode("remote")).toMatch(/^\d{8}$/);
    }
  });
});

describe("isPairCode", () => {
  it("accepts a plain 6-digit code", () => {
    expect(isPairCode("482917")).toBe(true);
  });

  it("accepts a plain 8-digit code", () => {
    expect(isPairCode("48291756")).toBe(true);
  });

  it("accepts spaced and dashed forms", () => {
    expect(isPairCode("482 917")).toBe(true);
    expect(isPairCode("482-917")).toBe(true);
    expect(isPairCode("4829 1756")).toBe(true);
  });

  it("rejects lengths other than 6 or 8", () => {
    expect(isPairCode("48291")).toBe(false);
    expect(isPairCode("4829170")).toBe(false);
    expect(isPairCode("482917561")).toBe(false);
  });

  it("rejects letters", () => {
    expect(isPairCode("48291a")).toBe(false);
  });
});

describe("formatPairCode", () => {
  it("splits a 6-digit code into two groups of three", () => {
    expect(formatPairCode("482917")).toBe("482 917");
  });

  it("splits an 8-digit code into two groups of four", () => {
    expect(formatPairCode("48291756")).toBe("4829 1756");
  });
});

describe("PAIR_TTL_MS", () => {
  it("is ten minutes", () => {
    expect(PAIR_TTL_MS).toBe(600_000);
  });
});
