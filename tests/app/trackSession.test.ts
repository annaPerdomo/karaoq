// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { startSessionTracking } from "../../app/queue/trackSession";

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("{}"))));
  setVisibility("visible");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("startSessionTracking", () => {
  it("beats on start and every minute while visible", async () => {
    const stop = startSessionTracking("ROOM", "Ann", "singer");
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetch).toHaveBeenCalledTimes(3);
    stop();
  });

  it("stays quiet while hidden and beats once on return", async () => {
    const stop = startSessionTracking("ROOM", "Ann", "singer");
    setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(fetch).toHaveBeenCalledTimes(1);
    setVisibility("visible");
    expect(fetch).toHaveBeenCalledTimes(2);
    stop();
  });

  it("keeps a hidden tab's session alive with a beat every 25 minutes", async () => {
    const stop = startSessionTracking("ROOM", "Ann", "host");
    setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(25 * 60_000 - 1);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(25 * 60_000);
    expect(fetch).toHaveBeenCalledTimes(3);
    stop();
  });

  it("stops beating once stopped", async () => {
    const stop = startSessionTracking("ROOM", "Ann", "host");
    stop();
    setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
