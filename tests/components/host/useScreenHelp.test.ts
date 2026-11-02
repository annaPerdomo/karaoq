import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { render, renderHook, act } from "@testing-library/react";
import { useScreenHelp } from "../../../components/host/hooks/useScreenHelp";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const SAMSUNG_TV_UA =
  "Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) 85.0.4183.93/6.0 TV Safari/537.36";

function stubUA(ua: string) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);
}

function setup(joinCode: string | undefined) {
  const setPlayMode = vi.fn();
  const rememberMode = vi.fn();
  const { result } = renderHook(() =>
    useScreenHelp({ joinCode, setPlayMode, rememberMode, displayConnected: false })
  );
  return { result, setPlayMode, rememberMode };
}

describe("useScreenHelp", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({});
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens and posts the roomId once", () => {
    const { result } = setup("ROOM1");

    act(() => {
      result.current.open();
    });

    expect(result.current.isOpen).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/analytics/screen-help");
    expect(JSON.parse(init.body)).toEqual({ roomId: "ROOM1" });
  });

  it("posts the expanded option", () => {
    const { result } = setup("ROOM1");

    act(() => {
      result.current.onOptionOpened("pair");
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ roomId: "ROOM1", option: "pair" });
  });

  it("switches to display mode without opening a window", () => {
    const { result, setPlayMode, rememberMode } = setup("ROOM1");

    act(() => {
      result.current.useDisplayMode();
    });

    expect(setPlayMode).toHaveBeenCalledWith("tv");
    expect(rememberMode).toHaveBeenCalledWith("tv");
  });

  it("still opens with no joinCode, but sends no analytics", () => {
    const { result } = setup(undefined);

    act(() => {
      result.current.open();
    });

    expect(result.current.isOpen).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads mobile from an iPhone UA", () => {
    stubUA(IPHONE_UA);
    const { result } = setup("ROOM1");
    expect(result.current.device).toBe("mobile");
  });

  it("reads tv from a Samsung Tizen UA", () => {
    stubUA(SAMSUNG_TV_UA);
    const { result } = setup("ROOM1");
    expect(result.current.device).toBe("tv");
  });

  it("is null before the UA effect runs", () => {
    let deviceOnFirstRender: "tv" | "mobile" | "desktop" | null | undefined;
    function Capture() {
      const screenHelp = useScreenHelp({ joinCode: "ROOM1", setPlayMode: vi.fn(), rememberMode: vi.fn(), displayConnected: false });
      if (deviceOnFirstRender === undefined) deviceOnFirstRender = screenHelp.device;
      return null;
    }
    render(React.createElement(Capture));
    expect(deviceOnFirstRender).toBeNull();
  });

  it("remembers a confirmed screen for the room until that display goes away", () => {
    sessionStorage.clear();
    const props = { joinCode: "ROOM9", setPlayMode: vi.fn(), rememberMode: vi.fn(), displayConnected: true };
    const { result, rerender } = renderHook((p: typeof props) => useScreenHelp(p), { initialProps: props });
    expect(result.current.verified).toBe(false);

    act(() => result.current.markVerified());
    expect(result.current.verified).toBe(true);
    expect(sessionStorage.getItem("karaoq_screen_ok:ROOM9")).toBe("1");

    rerender({ ...props, displayConnected: false });
    expect(result.current.verified).toBe(false);
    expect(sessionStorage.getItem("karaoq_screen_ok:ROOM9")).toBeNull();
  });

  it("sendTest posts the room's screen test", () => {
    const { result } = setup("ROOM1");
    act(() => result.current.sendTest());
    expect(fetchMock).toHaveBeenCalledWith("/api/queue/ROOM1/screen-test", { method: "POST" });
  });
});
