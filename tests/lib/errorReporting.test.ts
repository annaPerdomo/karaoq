import { describe, it, expect, vi, beforeEach } from "vitest";

// Module state (install latch, throttle map, per-load cap) must reset between
// tests, so the module is re-imported fresh each time.
async function freshReporter() {
  vi.resetModules();
  return import("../../lib/errorReporting");
}

describe("errorReporting", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("extracts the room id from room pages only", async () => {
    const { roomIdFromPath } = await freshReporter();
    expect(roomIdFromPath("/host/ABCD")).toBe("ABCD");
    expect(roomIdFromPath("/sing/XY12")).toBe("XY12");
    expect(roomIdFromPath("/display/Q9K2")).toBe("Q9K2");
    expect(roomIdFromPath("/host/ABCD/extra")).toBe("ABCD");
    expect(roomIdFromPath("/")).toBe("");
    expect(roomIdFromPath("/admin")).toBe("");
    expect(roomIdFromPath("/guide/host-a-party")).toBe("");
  });

  it("canonicalizes a lowercase room code so it matches every other collection", async () => {
    const { roomIdFromPath } = await freshReporter();
    expect(roomIdFromPath("/sing/abcd1")).toBe("ABCD1");
    expect(roomIdFromPath("/host/aB3d")).toBe("AB3D");
  });

  it("drops opaque cross-origin 'Script error.' reports", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const { reportClientError } = await freshReporter();

    reportClientError("window", "Script error.");
    reportClientError("window", "script error");
    expect(fetchMock).not.toHaveBeenCalled();

    // The same message *with* a stack is a real same-origin error, so it stays.
    reportClientError("window", "Script error.", "at handler (app.js:1:1)");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it("posts an uncaught error once per message per minute", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const { reportClientError } = await freshReporter();

    reportClientError("window", "boom", "stack");
    reportClientError("window", "boom", "stack");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/analytics/error");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.message).toBe("boom");
    expect(body.stack).toBe("stack");
    expect(body.source).toBe("window");

    // A different message is not throttled by the first.
    reportClientError("window", "other boom");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.unstubAllGlobals();
  });

  it("lets the same message report again after the cooldown", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const { reportClientError } = await freshReporter();

    reportClientError("promise", "boom");
    vi.advanceTimersByTime(61_000);
    reportClientError("promise", "boom");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.unstubAllGlobals();
  });

  it("caps reports per page load so an error loop can't flood", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const { reportClientError } = await freshReporter();

    for (let i = 0; i < 50; i++) {
      reportClientError("window", `distinct error ${i}`);
    }
    expect(fetchMock).toHaveBeenCalledTimes(20);

    vi.unstubAllGlobals();
  });

  it("install wires window error and rejection listeners exactly once", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const { installErrorReporting } = await freshReporter();

    installErrorReporting();
    installErrorReporting();

    window.dispatchEvent(new ErrorEvent("error", { message: "kaboom" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).message).toBe("kaboom");

    vi.unstubAllGlobals();
  });

  it("never throws when fetch itself is broken", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("no network");
      })
    );
    const { reportClientError } = await freshReporter();
    expect(() => reportClientError("window", "boom")).not.toThrow();
    vi.unstubAllGlobals();
  });
});
