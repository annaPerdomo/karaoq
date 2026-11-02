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
  it("fetches and shows the formatted code on press", async () => {
    document.documentElement.setAttribute("data-tv", "1");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: "482917", secret: "s3cr3t", expiresAt: Date.now() + 600_000 }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    render(<TvPairCard onActiveChange={vi.fn()} />);
    const button = await screen.findByRole("button", { name: /already started on your phone/i });
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByText("482 917")).toBeInTheDocument());
  });

  it("routes to the display on claim", async () => {
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

    render(<TvPairCard onActiveChange={vi.fn()} />);
    const button = await screen.findByRole("button", { name: /already started on your phone/i });
    await act(async () => {
      fireEvent.click(button);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });

    expect(mockPush).toHaveBeenCalledWith("/display/ROOM1");
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

    render(<TvPairCard onActiveChange={vi.fn()} />);
    const button = await screen.findByRole("button", { name: /already started on your phone/i });
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

    render(<TvPairCard onActiveChange={vi.fn()} />);
    const button = await screen.findByRole("button", { name: /already started on your phone/i });
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

    const { unmount } = render(<TvPairCard onActiveChange={vi.fn()} />);
    const button = await screen.findByRole("button", { name: /already started on your phone/i });
    await act(async () => {
      fireEvent.click(button);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
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

    render(<TvPairCard onActiveChange={vi.fn()} />);
    const button = await screen.findByRole("button", { name: /already started on your phone/i });
    await act(async () => {
      fireEvent.click(button);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });

    expect(await screen.findByRole("button", { name: /get a new code/i })).toBeInTheDocument();
  });

  it("issues one poll per interval despite rapid visibility toggles", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    document.documentElement.setAttribute("data-tv", "1");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: "482917", secret: "s3cr3t", expiresAt: Date.now() + 600_000 }),
      } as Response)
      .mockResolvedValue({ ok: true, json: async () => ({ status: "waiting" }) } as Response);
    vi.stubGlobal("fetch", fetchMock);

    render(<TvPairCard onActiveChange={vi.fn()} />);
    const button = await screen.findByRole("button", { name: /already started on your phone/i });
    await act(async () => {
      fireEvent.click(button);
    });
    const afterCreate = fetchMock.mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
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

    Object.defineProperty(document, "hidden", { value: false, configurable: true });
  });

  it("reports active while a code shows and returns to idle on Cancel", async () => {
    document.documentElement.setAttribute("data-tv", "1");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: "482917", secret: "s3cr3t", expiresAt: Date.now() + 600_000 }),
    } as Response));
    const onActiveChange = vi.fn();

    render(<TvPairCard onActiveChange={onActiveChange} />);
    fireEvent.click(await screen.findByRole("button", { name: /already started on your phone/i }));
    await waitFor(() => expect(screen.getByText("482 917")).toBeInTheDocument());
    expect(onActiveChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(await screen.findByRole("button", { name: /already started on your phone/i })).toBeInTheDocument();
    expect(onActiveChange).toHaveBeenLastCalledWith(false);
  });
});
