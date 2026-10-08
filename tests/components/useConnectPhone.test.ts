import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useConnectPhone } from "../../components/display/hooks/useConnectPhone";
import { getRoomKey, setRoomKey } from "../../lib/roomKeyStore";

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  document.documentElement.removeAttribute("data-tv");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.documentElement.removeAttribute("data-tv");
});

describe("useConnectPhone", () => {
  it("creates a pairing on open and shows the code", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: "48291765", secret: "s3cr3t", expiresAt: Date.now() + 600_000 }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useConnectPhone("ROOM1"));
    act(() => result.current.openPanel());

    await waitFor(() => expect(result.current.stage).toBe("showing"));
    expect(result.current.code).toBe("48291765");
  });

  it("moves to claimed then closes after the hold", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: "48291765", secret: "s3cr3t", expiresAt: Date.now() + 600_000 }),
      } as Response)
      .mockResolvedValue({ ok: true, json: async () => ({ status: "claimed", roomId: "ROOM1" }) } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useConnectPhone("ROOM1"));
    await act(async () => result.current.openPanel());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    expect(result.current.stage).toBe("claimed");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4100);
    });
    expect(result.current.open).toBe(false);
  });

  it("rewrites the stored key to display and flips isHost false when claimed as yourRole display", async () => {
    document.documentElement.setAttribute("data-tv", "1");
    setRoomKey("ROOM1", "tv-host-key", "host");
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: "48291765", secret: "s3cr3t", expiresAt: Date.now() + 600_000 }),
      } as Response)
      .mockResolvedValue({
        ok: true,
        json: async () => ({ status: "claimed", roomId: "ROOM1", yourRole: "display" }),
      } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useConnectPhone("ROOM1"));
    await waitFor(() => expect(result.current.isHost).toBe(true));
    await act(async () => result.current.openPanel());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    expect(result.current.stage).toBe("claimed");
    expect(getRoomKey("ROOM1")).toEqual({ key: "tv-host-key", role: "display" });
    expect(result.current.isHost).toBe(false);
  });

  it("keeps isHost false for a host-keyed device that isn't a TV", async () => {
    setRoomKey("ROOM1", "laptop-host-key", "host");

    const { result } = renderHook(() => useConnectPhone("ROOM1"));
    await waitFor(() => expect(getRoomKey("ROOM1")?.role).toBe("host"));
    expect(result.current.isHost).toBe(false);
  });

  it("moves to expired when the poll reports it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: "48291765", secret: "s3cr3t", expiresAt: Date.now() + 600_000 }),
      } as Response)
      .mockResolvedValue({ status: 404, ok: false, json: async () => ({}) } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useConnectPhone("ROOM1"));
    await act(async () => result.current.openPanel());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    expect(result.current.stage).toBe("expired");
  });

  it("shows error on a failed creation and lets retry recreate it", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: "48291765", secret: "s3cr3t", expiresAt: Date.now() + 600_000 }),
      } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useConnectPhone("ROOM1"));
    await act(async () => result.current.openPanel());
    await waitFor(() => expect(result.current.stage).toBe("error"));

    await act(async () => result.current.retry());
    await waitFor(() => expect(result.current.stage).toBe("showing"));
  });

  it("reopening after close creates a fresh pairing even if the first create was still in flight", async () => {
    let resolveFirst: (v: Response) => void = () => {};
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<Response>((resolve) => { resolveFirst = resolve; })
      )
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: "11112222", secret: "second", expiresAt: Date.now() + 600_000 }),
      } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useConnectPhone("ROOM1"));
    act(() => result.current.openPanel());
    expect(result.current.stage).toBe("creating");

    act(() => result.current.close());
    act(() => result.current.openPanel());

    await waitFor(() => expect(result.current.stage).toBe("showing"));
    expect(result.current.code).toBe("11112222");

    // The stale first create resolving afterwards must not override the fresh attempt.
    await act(async () => {
      resolveFirst({
        ok: true,
        json: async () => ({ code: "00000000", secret: "stale", expiresAt: Date.now() + 600_000 }),
      } as Response);
    });
    expect(result.current.code).toBe("11112222");
  });

  it("issues one poll per interval despite rapid visibility toggles", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: "48291765", secret: "s3cr3t", expiresAt: Date.now() + 600_000 }),
      } as Response)
      .mockResolvedValue({ ok: true, json: async () => ({ status: "waiting" }) } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useConnectPhone("ROOM1"));
    await act(async () => result.current.openPanel());
    await waitFor(() => expect(result.current.stage).toBe("showing"));
    const afterCreate = fetchMock.mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(fetchMock.mock.calls.length).toBe(afterCreate + 1);

    await act(async () => {
      Object.defineProperty(document, "hidden", { value: true, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
      Object.defineProperty(document, "hidden", { value: false, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
      Object.defineProperty(document, "hidden", { value: true, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
      Object.defineProperty(document, "hidden", { value: false, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(fetchMock.mock.calls.length).toBe(afterCreate + 2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(fetchMock.mock.calls.length).toBe(afterCreate + 3);

    Object.defineProperty(document, "hidden", { value: false, configurable: true });
  });

  it("stops polling on unmount", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: "48291765", secret: "s3cr3t", expiresAt: Date.now() + 600_000 }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const { result, unmount } = renderHook(() => useConnectPhone("ROOM1"));
    await act(async () => result.current.openPanel());
    await waitFor(() => expect(result.current.stage).toBe("showing"));

    const callsAtUnmount = fetchMock.mock.calls.length;
    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(fetchMock.mock.calls.length).toBe(callsAtUnmount);
  });

  it("ignores a second openPanel call while already open", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: "48291765", secret: "s3cr3t", expiresAt: Date.now() + 600_000 }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useConnectPhone("ROOM1"));
    await act(async () => result.current.openPanel());
    await waitFor(() => expect(result.current.stage).toBe("showing"));

    act(() => result.current.openPanel());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns focus to the Connect a phone button on close", async () => {
    const button = document.createElement("button");
    button.setAttribute("data-remote", "connect-phone");
    document.body.appendChild(button);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: "48291765", secret: "s3cr3t", expiresAt: Date.now() + 600_000 }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useConnectPhone("ROOM1"));
    await act(async () => result.current.openPanel());
    await waitFor(() => expect(result.current.stage).toBe("showing"));

    act(() => result.current.close());
    await waitFor(() => expect(document.activeElement).toBe(button));
    button.remove();
  });

  it("closes when Customize opens", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: "48291765", secret: "s3cr3t", expiresAt: Date.now() + 600_000 }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(({ editing }) => useConnectPhone("ROOM1", editing), {
      initialProps: { editing: false },
    });
    await act(async () => result.current.openPanel());
    await waitFor(() => expect(result.current.stage).toBe("showing"));

    rerender({ editing: true });
    await waitFor(() => expect(result.current.open).toBe(false));
  });

  it("stops polling once closed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: "48291765", secret: "s3cr3t", expiresAt: Date.now() + 600_000 }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useConnectPhone("ROOM1"));
    await act(async () => result.current.openPanel());
    await waitFor(() => expect(result.current.stage).toBe("showing"));

    act(() => result.current.close());
    const callsAtClose = fetchMock.mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(fetchMock.mock.calls.length).toBe(callsAtClose);
  });
});
