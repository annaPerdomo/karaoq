import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { recordServerTime, serverNow, resetClockSkew } from "../../lib/clockSkew";

const LOCAL = Date.UTC(2026, 7, 2, 20, 0, 0);

describe("clockSkew", () => {
  beforeEach(() => {
    resetClockSkew();
    vi.useFakeTimers();
    vi.setSystemTime(LOCAL);
  });

  afterEach(() => {
    vi.useRealTimers();
    resetClockSkew();
  });

  it("reads the local clock until a room says otherwise", () => {
    expect(serverNow()).toBe(LOCAL);
  });

  it("corrects a phone running slow onto the server's clock", () => {
    recordServerTime(LOCAL + 40_000);
    expect(serverNow()).toBe(LOCAL + 40_000);
    // The offset holds as time passes, rather than snapping back.
    vi.setSystemTime(LOCAL + 10_000);
    expect(serverNow()).toBe(LOCAL + 50_000);
  });

  it("corrects a phone running fast", () => {
    recordServerTime(LOCAL - 90_000);
    expect(serverNow()).toBe(LOCAL - 90_000);
  });

  it("keeps the last known offset when a response omits the field", () => {
    recordServerTime(LOCAL + 40_000);
    recordServerTime(undefined);
    recordServerTime("not a time");
    recordServerTime(NaN);
    expect(serverNow()).toBe(LOCAL + 40_000);
  });
});
