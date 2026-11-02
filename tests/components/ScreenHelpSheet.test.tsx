import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScreenHelpSheet, ScreenHelpSheetProps } from "../../components/host/ScreenHelpSheet";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Mobile Safari/537.36";
const MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36";
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
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ScreenHelpSheet", () => {
  it("renders nothing when isOpen is false", () => {
    stubUA(IPHONE_UA);
    const { container } = render(<ScreenHelpSheet {...baseProps()} isOpen={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("iPhone UA: orders options pair, mirror, laptop and shows the pairing input first", () => {
    stubUA(IPHONE_UA);
    render(<ScreenHelpSheet {...baseProps()} />);

    const headers = screen
      .getAllByRole("button")
      .filter((b) => b.hasAttribute("aria-expanded"))
      .map((b) => b.textContent);
    const pairIdx = headers.findIndex((h) => /smart TV/i.test(h ?? ""));
    const mirrorIdx = headers.findIndex((h) => /mirror/i.test(h ?? ""));
    const laptopIdx = headers.findIndex((h) => /laptop/i.test(h ?? ""));
    expect(pairIdx).toBeGreaterThanOrEqual(0);
    expect(pairIdx).toBeLessThan(mirrorIdx);
    expect(mirrorIdx).toBeLessThan(laptopIdx);

    expect(screen.getByPlaceholderText("000 000")).toBeInTheDocument();
    expect(screen.queryByText(/screen mirroring/i)).not.toBeInTheDocument();
  });

  it("expanding mirror shows AirPlay steps, hides the pairing input, and fires onOptionOpened once each", () => {
    stubUA(IPHONE_UA);
    const onOptionOpened = vi.fn();
    render(<ScreenHelpSheet {...baseProps()} onOptionOpened={onOptionOpened} />);

    const mirrorHeader = screen.getByText(/mirror this device/i).closest("button")!;
    fireEvent.click(mirrorHeader);

    expect(screen.getByText(/screen mirroring/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("000 000")).not.toBeInTheDocument();

    fireEvent.click(mirrorHeader);
    fireEvent.click(mirrorHeader);

    expect(onOptionOpened).toHaveBeenNthCalledWith(1, "pair");
    expect(onOptionOpened).toHaveBeenNthCalledWith(2, "mirror");
    expect(onOptionOpened).toHaveBeenCalledTimes(2);
  });

  it("reopening after closing with mirror expanded re-fires onOptionOpened for the first option, not the stale one", () => {
    stubUA(IPHONE_UA);
    const onOptionOpened = vi.fn();
    const { rerender } = render(<ScreenHelpSheet {...baseProps()} onOptionOpened={onOptionOpened} />);

    const mirrorHeader = screen.getByText(/mirror this device/i).closest("button")!;
    fireEvent.click(mirrorHeader);

    rerender(<ScreenHelpSheet {...baseProps()} isOpen={false} onOptionOpened={onOptionOpened} />);
    rerender(<ScreenHelpSheet {...baseProps()} isOpen={true} onOptionOpened={onOptionOpened} />);

    expect(onOptionOpened.mock.calls.map((c) => c[0])).toEqual(["pair", "mirror", "pair"]);
  });

  it("Android UA: mirror body shows the Cast step text", () => {
    stubUA(ANDROID_UA);
    render(<ScreenHelpSheet {...baseProps()} />);

    const mirrorHeader = screen.getByText(/mirror this device/i).closest("button")!;
    fireEvent.click(mirrorHeader);

    expect(screen.getByText(/quick settings/i)).toBeInTheDocument();
    expect(screen.getByText(/chromecast/i)).toBeInTheDocument();
  });

  it("Mac UA: first option is popout and its open-display button calls onOpenTvDisplay", () => {
    stubUA(MAC_UA);
    const onOpenTvDisplay = vi.fn();
    render(<ScreenHelpSheet {...baseProps()} onOpenTvDisplay={onOpenTvDisplay} />);

    expect(screen.getByText(/this computer is plugged into the screen/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /open the display window/i }));
    expect(onOpenTvDisplay).toHaveBeenCalledTimes(1);
  });

  it("Samsung TV UA: only the onTv body renders, no buttons besides Done", () => {
    stubUA(SAMSUNG_TV_UA);
    render(<ScreenHelpSheet {...baseProps()} />);

    expect(screen.getByText(/you're already on the big screen/i)).toBeInTheDocument();
    const buttons = screen.getAllByRole("button").filter((b) => b.textContent !== "Done");
    expect(buttons).toHaveLength(1);
  });

  it("laptop option step2 contains the display URL and its button switches mode", () => {
    stubUA(IPHONE_UA);
    const onUseDisplayMode = vi.fn();
    render(<ScreenHelpSheet {...baseProps()} onUseDisplayMode={onUseDisplayMode} />);

    const laptopHeader = screen.getByText(/a laptop plugged into the screen/i).closest("button")!;
    fireEvent.click(laptopHeader);

    expect(screen.getByText("karaoq.live/display/ABCD")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /play on that display/i }));
    expect(onUseDisplayMode).toHaveBeenCalledTimes(1);
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
