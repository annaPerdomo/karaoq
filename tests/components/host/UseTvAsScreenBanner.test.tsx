import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { UseTvAsScreenBanner } from "../../../components/host/UseTvAsScreenBanner";
import { shouldOfferTvScreen } from "../../../components/host/tvScreenBanner";

const mockPush = vi.fn();
vi.mock("next/router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  document.documentElement.removeAttribute("data-tv");
});

describe("shouldOfferTvScreen", () => {
  const base = { isTv: true, remote: false, access: "allowed" as const, playMode: null, dismissed: false };

  it("shows when every condition is met", () => {
    expect(shouldOfferTvScreen(base)).toBe(true);
  });

  it("hides when not a TV", () => {
    expect(shouldOfferTvScreen({ ...base, isTv: false })).toBe(false);
  });

  it("hides for a co-host", () => {
    expect(shouldOfferTvScreen({ ...base, remote: true })).toBe(false);
  });

  it("hides without access", () => {
    expect(shouldOfferTvScreen({ ...base, access: "checking" })).toBe(false);
    expect(shouldOfferTvScreen({ ...base, access: "locked" })).toBe(false);
  });

  it("hides once play mode is tv", () => {
    expect(shouldOfferTvScreen({ ...base, playMode: "tv" })).toBe(false);
  });

  it("hides once dismissed", () => {
    expect(shouldOfferTvScreen({ ...base, dismissed: true })).toBe(false);
  });
});

describe("UseTvAsScreenBanner", () => {
  it("renders nothing without data-tv", () => {
    const { container } = render(
      <UseTvAsScreenBanner remote={false} playMode={null} joinCode="ROOM1" onUseAsScreen={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("routes to the display once the mode change succeeds", async () => {
    document.documentElement.setAttribute("data-tv", "1");
    const onUseAsScreen = vi.fn().mockResolvedValue(true);
    render(
      <UseTvAsScreenBanner remote={false} playMode={null} joinCode="ROOM1" onUseAsScreen={onUseAsScreen} />
    );

    const use = await screen.findByRole("button", { name: /use this tv as the screen/i });
    fireEvent.click(use);

    expect(onUseAsScreen).toHaveBeenCalled();
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/display/ROOM1"));
  });

  it("stays on the host page when the mode change fails", async () => {
    document.documentElement.setAttribute("data-tv", "1");
    const onUseAsScreen = vi.fn().mockResolvedValue(false);
    render(
      <UseTvAsScreenBanner remote={false} playMode={null} joinCode="ROOM1" onUseAsScreen={onUseAsScreen} />
    );

    const use = await screen.findByRole("button", { name: /use this tv as the screen/i });
    fireEvent.click(use);

    await waitFor(() => expect(onUseAsScreen).toHaveBeenCalled());
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("Keep sets the dismissal flag and hides the banner", async () => {
    document.documentElement.setAttribute("data-tv", "1");
    render(<UseTvAsScreenBanner remote={false} playMode={null} joinCode="ROOM1" onUseAsScreen={vi.fn()} />);

    const keep = await screen.findByRole("button", { name: /keep hosting here/i });
    fireEvent.click(keep);

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /keep hosting here/i })).not.toBeInTheDocument();
    });
    expect(localStorage.getItem("karaoq_tv_screen_dismissed_ROOM1")).toBe("1");
  });
});
