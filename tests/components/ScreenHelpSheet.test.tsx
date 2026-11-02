import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ScreenHelpSheet, ScreenHelpSheetProps } from "../../components/host/ScreenHelpSheet";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Mobile Safari/537.36";
const MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36";
const WINDOWS_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36";
const SAMSUNG_TV_UA =
  "Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) 85.0.4183.93/6.0 TV Safari/537.36";

function stubUA(ua: string) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);
}

function baseProps(): ScreenHelpSheetProps {
  return {
    isOpen: true,
    onClose: vi.fn(),
    joinCode: "ABCD",
    displayHost: "karaoq.live",
    onPaired: vi.fn(),
    onOpenTvDisplay: vi.fn(),
    onUseDisplayMode: vi.fn(),
    onPlayHere: vi.fn(),
    displayConnected: false,
    verified: false,
    getDisplayWindow: () => null,
    onSendTest: vi.fn(),
    onStepEvent: vi.fn(),
    onVerified: vi.fn(),
  };
}

function headers() {
  return screen
    .getAllByRole("button")
    .filter((b) => b.hasAttribute("aria-expanded"))
    .map((b) => b.textContent ?? "");
}

const next = () => fireEvent.click(screen.getByRole("button", { name: "Done — next" }));
const openOption = (name: RegExp) => fireEvent.click(screen.getByText(name).closest("button")!);

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ScreenHelpSheet", () => {
  it("renders nothing when isOpen is false", () => {
    stubUA(IPHONE_UA);
    const { container } = render(<ScreenHelpSheet {...baseProps()} isOpen={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("iPhone: offers pair, mirror, laptop/tablet, then a tablet as the screen, one step at a time", () => {
    stubUA(IPHONE_UA);
    render(<ScreenHelpSheet {...baseProps()} />);

    const h = headers();
    expect(h.findIndex((x) => /smart TV/i.test(x))).toBe(0);
    expect(h.findIndex((x) => /mirror/i.test(x))).toBe(1);
    expect(h.findIndex((x) => /laptop or tablet near/i.test(x))).toBe(2);
    expect(h.findIndex((x) => /no big screen/i.test(x))).toBe(3);

    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
    expect(screen.getByText(/open its web browser app/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("000 000")).not.toBeInTheDocument();

    next();
    next();
    next();
    expect(screen.getByText("Step 4 of 4")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("000 000")).toBeInTheDocument();
    // Pairing finishes the flow on its own; there's nothing to click past.
    expect(screen.queryByRole("button", { name: "Done — next" })).not.toBeInTheDocument();
  });

  it("“That didn't work” shows the fix for that step and reports where the host got stuck", () => {
    stubUA(IPHONE_UA);
    const onStepEvent = vi.fn();
    render(<ScreenHelpSheet {...baseProps()} onStepEvent={onStepEvent} />);

    fireEvent.click(screen.getByRole("button", { name: "That didn't work" }));
    expect(screen.getByText(/some TVs have no browser at all/i)).toBeInTheDocument();
    expect(onStepEvent).toHaveBeenCalledWith({ option: "pair", method: undefined, step: "pair.browser", outcome: "stuck" });
  });

  it("mirror on iPhone ends by asking about the big screen, then plays here", () => {
    stubUA(IPHONE_UA);
    const onPlayHere = vi.fn();
    const onStepEvent = vi.fn();
    const onOptionOpened = vi.fn();
    render(<ScreenHelpSheet {...baseProps()} onPlayHere={onPlayHere} onStepEvent={onStepEvent} onOptionOpened={onOptionOpened} />);

    openOption(/mirror this device/i);
    expect(onOptionOpened.mock.calls.map((c) => c[0])).toEqual(["pair", "mirror"]);
    expect(screen.getByText(/same Wi/i)).toBeInTheDocument();
    next();
    expect(screen.getByText(/swipe down from the top-right corner/i)).toBeInTheDocument();
    next();
    next();

    expect(screen.getByText(/can you see this same page on it/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Yes, I see it" }));
    expect(onStepEvent).toHaveBeenCalledWith({ option: "mirror", method: undefined, step: "verify", outcome: "verified" });
    expect(screen.getByText(/you're all set/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Play on this device" }));
    expect(onPlayHere).toHaveBeenCalledTimes(1);
  });

  it("Android: mirror uses the Quick Settings Cast steps", () => {
    stubUA(ANDROID_UA);
    render(<ScreenHelpSheet {...baseProps()} />);
    openOption(/mirror this device/i);
    next();
    expect(screen.getByText(/swipe down twice/i)).toBeInTheDocument();
  });

  it("Mac: the computer route walks cable → input → extend → open, and the open button opens the display", () => {
    stubUA(MAC_UA);
    const onOpenTvDisplay = vi.fn();
    render(<ScreenHelpSheet {...baseProps()} onOpenTvDisplay={onOpenTvDisplay} />);

    expect(screen.getByText(/connect this computer to the screen/i)).toBeInTheDocument();
    expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual(["HDMI cable", "AirPlay", "Chromecast"]);
    expect(screen.getByText(/plug one end of an HDMI cable/i)).toBeInTheDocument();
    next();
    expect(screen.getByText(/press Input or Source/i)).toBeInTheDocument();
    next();
    expect(screen.getByText(/system settings → displays/i)).toBeInTheDocument();
    next();
    fireEvent.click(screen.getByRole("button", { name: /open the display window/i }));
    expect(onOpenTvDisplay).toHaveBeenCalledTimes(1);
  });

  it("Mac: switching to Chromecast restarts on the right-click Cast route", () => {
    stubUA(MAC_UA);
    render(<ScreenHelpSheet {...baseProps()} />);
    next();
    fireEvent.click(screen.getByRole("radio", { name: "Chromecast" }));
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
    next();
    next();
    expect(screen.getByText(/right-click anywhere and choose cast/i)).toBeInTheDocument();
  });

  it("Windows: offers Windows wireless with Win+K then Win+P", () => {
    stubUA(WINDOWS_UA);
    render(<ScreenHelpSheet {...baseProps()} />);
    fireEvent.click(screen.getByRole("radio", { name: "Windows wireless" }));
    expect(screen.getByText(/windows key \+ k/i)).toBeInTheDocument();
    next();
    expect(screen.getByText(/windows key \+ p/i)).toBeInTheDocument();
  });

  it("moves past the open step by itself once the display window actually opens", () => {
    vi.useFakeTimers();
    stubUA(MAC_UA);
    let popup: Window | null = null;
    render(<ScreenHelpSheet {...baseProps()} getDisplayWindow={() => popup} />);
    next();
    next();
    next();
    expect(screen.getByText("Step 4 of 6")).toBeInTheDocument();

    popup = {
      closed: false,
      screen: window.screen,
      innerWidth: 400,
      innerHeight: 300,
      document: { fullscreenElement: null },
    } as unknown as Window;
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(screen.getByText(/we can see that worked/i)).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByText("Step 5 of 6")).toBeInTheDocument();
  });

  it("a second screen that was already attached doesn't skip the plug-in step", () => {
    vi.useFakeTimers();
    stubUA(MAC_UA);
    Object.defineProperty(window.screen, "isExtended", { value: true, configurable: true });
    try {
      render(<ScreenHelpSheet {...baseProps()} />);
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.getByText("Step 1 of 6")).toBeInTheDocument();
      expect(screen.getByText(/looks like this is already done/i)).toBeInTheDocument();
    } finally {
      delete (window.screen as unknown as Record<string, unknown>).isExtended;
    }
  });

  it("laptop/tablet route: the URL step ticks off when the display goes live, and the test confirms it", () => {
    vi.useFakeTimers();
    stubUA(IPHONE_UA);
    const props = { ...baseProps(), onUseDisplayMode: vi.fn(), onSendTest: vi.fn(), onVerified: vi.fn() };
    const { rerender } = render(<ScreenHelpSheet {...props} />);
    openOption(/a laptop or tablet near the screen/i);
    expect(screen.getByText("karaoq.live/display/ABCD")).toBeInTheDocument();

    rerender(<ScreenHelpSheet {...props} displayConnected={true} />);
    expect(screen.getByText(/we can see that worked/i)).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByText(/into the laptop or tablet and the other into the screen/i)).toBeInTheDocument();
    next();
    next();
    next();

    fireEvent.click(screen.getByRole("button", { name: "Show a test on the big screen" }));
    expect(props.onSendTest).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, I see it" }));
    expect(props.onUseDisplayMode).toHaveBeenCalledTimes(1);
    expect(props.onVerified).toHaveBeenCalledTimes(1);
  });

  it("the final check waits for a live display before offering the test", () => {
    stubUA(IPHONE_UA);
    render(<ScreenHelpSheet {...baseProps()} />);
    openOption(/no big screen/i);
    next();
    next();
    next();
    expect(screen.getByText(/waiting for the display to open/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show a test on the big screen" })).not.toBeInTheDocument();
  });

  it("a “No” at the check shows what to try and reports it", () => {
    stubUA(IPHONE_UA);
    const onStepEvent = vi.fn();
    render(<ScreenHelpSheet {...baseProps()} displayConnected={true} verified={true} onStepEvent={onStepEvent} />);
    openOption(/no big screen/i);
    next();
    next();
    next();
    fireEvent.click(screen.getByRole("button", { name: "Show a test on the big screen" }));
    fireEvent.click(screen.getByRole("button", { name: "No" }));
    expect(screen.getByText(/pick a different option above/i)).toBeInTheDocument();
    expect(onStepEvent).toHaveBeenCalledWith({ option: "standalone", method: undefined, step: "verify", outcome: "failed" });
  });

  it("an open but unconfirmed display gets a quick check above the options", () => {
    stubUA(MAC_UA);
    const onVerified = vi.fn();
    const { rerender } = render(<ScreenHelpSheet {...baseProps()} displayConnected={true} onVerified={onVerified} />);
    expect(screen.getByText(/a display is open/i)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Show a test on the big screen" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Yes, I see it" })[0]);
    expect(onVerified).toHaveBeenCalledTimes(1);

    rerender(<ScreenHelpSheet {...baseProps()} displayConnected={true} verified={true} />);
    expect(screen.queryByText(/a display is open/i)).not.toBeInTheDocument();
  });

  it("Safari: an AirPlay screen nearby jumps to mirroring and says so", () => {
    stubUA(IPHONE_UA);
    (window as unknown as Record<string, unknown>).WebKitPlaybackTargetAvailabilityEvent = class {};
    try {
      render(<ScreenHelpSheet {...baseProps()} />);
      const video = document.querySelector("video[x-webkit-airplay]")!;
      act(() => {
        video.dispatchEvent(Object.assign(new Event("webkitplaybacktargetavailabilitychanged"), { availability: "available" }));
      });
      expect(screen.getByText("AirPlay screen nearby")).toBeInTheDocument();
      expect(screen.getByText(/mirror this device/i).closest("button")).toHaveAttribute("aria-expanded", "true");
    } finally {
      delete (window as unknown as Record<string, unknown>).WebKitPlaybackTargetAvailabilityEvent;
    }
  });

  it("Samsung TV UA: only the onTv body renders, no buttons besides Done", () => {
    stubUA(SAMSUNG_TV_UA);
    render(<ScreenHelpSheet {...baseProps()} />);
    expect(screen.getByText(/you're already on the big screen/i)).toBeInTheDocument();
    const buttons = screen.getAllByRole("button").filter((b) => b.textContent !== "Done");
    expect(buttons).toHaveLength(1);
  });

  it("Escape and the Done button call onClose", () => {
    stubUA(IPHONE_UA);
    const onClose = vi.fn();
    render(<ScreenHelpSheet {...baseProps()} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
