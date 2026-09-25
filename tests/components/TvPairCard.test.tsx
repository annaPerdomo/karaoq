import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import TvPairCard from "../../components/home/TvPairCard";

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
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("TvPairCard", () => {
  it("renders nothing without data-tv", () => {
    const { container } = render(<TvPairCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it("fetches and shows the formatted code on press", async () => {
    document.documentElement.setAttribute("data-tv", "1");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: "482917", secret: "s3cr3t", expiresAt: Date.now() + 600_000 }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    render(<TvPairCard />);
    const button = await screen.findByRole("button", { name: /show on this tv/i });
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByText("482 917")).toBeInTheDocument());
  });

  it("stores the display key and routes to the display on claim", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    document.documentElement.setAttribute("data-tv", "1");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: "482917", secret: "s3cr3t", expiresAt: Date.now() + 600_000 }),
      } as Response)
      .mockResolvedValue({ ok: true, json: async () => ({ status: "claimed", roomId: "ROOM1" }) } as Response);
    vi.stubGlobal("fetch", fetchMock);

    render(<TvPairCard />);
    const button = await screen.findByRole("button", { name: /show on this tv/i });
    await act(async () => {
      fireEvent.click(button);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });

    expect(mockPush).toHaveBeenCalledWith("/display/ROOM1");
    expect(localStorage.getItem("karaoq_room_key_ROOM1")).toBe(
      JSON.stringify({ key: "s3cr3t", role: "display" })
    );
  });

  it("ignores a second press while creating is in flight", async () => {
    document.documentElement.setAttribute("data-tv", "1");
    let resolveFetch: (v: Response) => void = () => {};
    const fetchMock = vi.fn().mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<TvPairCard />);
    const button = await screen.findByRole("button", { name: /show on this tv/i });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch({
      ok: true,
      json: async () => ({ code: "482917", secret: "s3cr3t", expiresAt: Date.now() + 600_000 }),
    } as Response);
    await waitFor(() => expect(screen.getByText("482 917")).toBeInTheDocument());
  });

  it("shows the generic error and a retry button when creating fails, not the expired copy", async () => {
    document.documentElement.setAttribute("data-tv", "1");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false } as Response));

    render(<TvPairCard />);
    const button = await screen.findByRole("button", { name: /show on this tv/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/that code expired/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /get a new code/i })).toBeInTheDocument();
  });

  it("never routes if the card unmounts while a poll is in flight", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    document.documentElement.setAttribute("data-tv", "1");
    let resolvePoll: (v: Response) => void = () => {};
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: "482917", secret: "s3cr3t", expiresAt: Date.now() + 600_000 }),
      } as Response)
      .mockReturnValue(
        new Promise<Response>((resolve) => {
          resolvePoll = resolve;
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const { unmount } = render(<TvPairCard />);
    const button = await screen.findByRole("button", { name: /show on this tv/i });
    await act(async () => {
      fireEvent.click(button);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });

    unmount();
    resolvePoll({ ok: true, json: async () => ({ status: "claimed", roomId: "ROOM1" }) } as Response);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows Get a new code once the code expires", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    document.documentElement.setAttribute("data-tv", "1");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: "482917", secret: "s3cr3t", expiresAt: Date.now() + 600_000 }),
      } as Response)
      .mockResolvedValue({ ok: true, json: async () => ({ status: "expired" }) } as Response);
    vi.stubGlobal("fetch", fetchMock);

    render(<TvPairCard />);
    const button = await screen.findByRole("button", { name: /show on this tv/i });
    await act(async () => {
      fireEvent.click(button);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });

    expect(await screen.findByRole("button", { name: /get a new code/i })).toBeInTheDocument();
  });
});
