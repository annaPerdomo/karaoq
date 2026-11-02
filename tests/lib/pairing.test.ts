import { describe, it, expect } from "vitest";
import { formatPairCode, isPairCode, PAIR_TTL_MS } from "../../lib/pairing";
import { hashPairSecret, newPairCode, newPairSecret } from "../../lib/pairingServer";

describe("newPairCode", () => {
  it("returns a 6-digit string, zero-padded", () => {
    for (let i = 0; i < 50; i++) {
      expect(newPairCode()).toMatch(/^\d{6}$/);
    }
  });
});

describe("newPairSecret / hashPairSecret", () => {
  it("mints distinct secrets and hashes them deterministically", () => {
    const a = newPairSecret();
    const b = newPairSecret();
    expect(a).not.toBe(b);
    expect(hashPairSecret(a)).toBe(hashPairSecret(a));
    expect(hashPairSecret(a)).not.toBe(a);
  });
});

describe("isPairCode", () => {
  it("accepts a plain 6-digit code", () => {
    expect(isPairCode("482917")).toBe(true);
  });

  it("accepts spaced and dashed forms", () => {
    expect(isPairCode("482 917")).toBe(true);
    expect(isPairCode("482-917")).toBe(true);
  });

  it("rejects lengths other than 6", () => {
    expect(isPairCode("48291")).toBe(false);
    expect(isPairCode("4829170")).toBe(false);
    expect(isPairCode("48291756")).toBe(false);
  });

  it("rejects letters", () => {
    expect(isPairCode("48291a")).toBe(false);
  });
});

describe("formatPairCode", () => {
  it("splits a 6-digit code into two groups of three", () => {
    expect(formatPairCode("482917")).toBe("482 917");
  });
});

describe("PAIR_TTL_MS", () => {
  it("is ten minutes", () => {
    expect(PAIR_TTL_MS).toBe(600_000);
  });
});
