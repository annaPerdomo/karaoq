import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import TvStartCard from "../../components/home/TvStartCard";

const mockPush = vi.fn();
vi.mock("next/router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

afterEach(() => {
  document.documentElement.removeAttribute("data-tv");
});

describe("TvStartCard", () => {
  it("renders nothing without data-tv", () => {
    const { container } = render(<TvStartCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it("creates a room, sets tv mode, remembers it, and navigates on press", async () => {
    document.documentElement.setAttribute("data-tv", "1");
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/mode")) return { ok: true } as Response;
      return { ok: true, status: 200 } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TvStartCard />);
    const button = await screen.findByRole("button", { name: /start on this tv/i });
    fireEvent.click(button);

    await waitFor(() => expect(mockPush).toHaveBeenCalled());

    const path = mockPush.mock.calls[0][0] as string;
    expect(path).toMatch(/^\/display\/[A-Z2-9]{5}$/);
    const code = path.split("/").pop()!;
    expect(sessionStorage.getItem("karaoq_tv_host")).toBe(code);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/api/queue/${code}/mode`),
      expect.any(Object)
    );

    vi.unstubAllGlobals();
  });

  it("shows the generic error and re-enables the button on failure", async () => {
    document.documentElement.setAttribute("data-tv", "1");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 }) as Response));

    render(<TvStartCard />);
    const button = await screen.findByRole("button", { name: /start on this tv/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });
    expect(button).not.toBeDisabled();
    expect(mockPush).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("keeps Start focused and swaps itself for the code when pairing is chosen", async () => {
    document.documentElement.setAttribute("data-tv", "1");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: "482917", secret: "s3cr3t", expiresAt: Date.now() + 600_000 }),
    } as Response));

    render(<TvStartCard />);
    const start = await screen.findByRole("button", { name: /start on this tv/i });
    expect(start).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: /already started on your phone/i }));
    await waitFor(() => expect(screen.getByText("482 917")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /start on this tv/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(await screen.findByRole("button", { name: /start on this tv/i })).toBeInTheDocument();

    vi.unstubAllGlobals();
  });
});
