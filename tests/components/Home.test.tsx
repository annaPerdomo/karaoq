import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Home from "../../components/Home";

const mockPush = vi.fn();
vi.mock("next/router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

global.fetch = vi.fn().mockResolvedValue({ ok: true });

// IntersectionObserver stub for scroll-reveal
class MockIntersectionObserver {
  callback: any;
  constructor(cb: any) {
    this.callback = cb;
  }
  observe() {
    this.callback([{ isIntersecting: true }]);
  }
  disconnect() {}
  unobserve() {}
}
(global as any).IntersectionObserver = MockIntersectionObserver;

// scrollIntoView stub for jsdom
Element.prototype.scrollIntoView = vi.fn();

describe("Home component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
  });

  it("renders the brand name and hero headline", () => {
    render(<Home />);

    // Brand appears multiple times (nav, demos, footer)
    expect(screen.getAllByText("KaraoQ").length).toBeGreaterThan(0);
    expect(screen.getByText(/YouTube Karaoke/)).toBeInTheDocument();
  });

  it("renders the Host and Join CTAs", () => {
    render(<Home />);

    // Host button appears in nav, hero, and final CTA
    expect(screen.getAllByRole("button", { name: /Host a Session/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /Join a Session/i }).length).toBeGreaterThan(0);
  });

  it("creates a room and navigates to host view on Host click", async () => {
    // Hosting now requires a name; seed a saved one (returning-host path).
    localStorage.setItem("karaoq_host_name", "Tester");
    render(<Home />);

    const hostBtns = screen.getAllByRole("button", { name: /Host a Session/i });
    fireEvent.click(hostBtns[0]);

    // Other effects (e.g. the last-hosted-room check) can also call fetch on
    // mount, so filter for the room call specifically.
    const queueCalls = () =>
      (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) =>
        String(url).startsWith("/api/queue/")
      );
    await waitFor(() => {
      expect(queueCalls()).toHaveLength(1);
    });

    const fetchCall = queueCalls()[0];
    expect(fetchCall[0]).toMatch(/^\/api\/queue\/[A-Z2-9]{5}$/);
    expect(fetchCall[1]).toMatchObject({ method: "POST" });

    expect(mockPush).toHaveBeenCalledWith(expect.stringMatching(/^\/host\/[A-Z2-9]{5}$/));
  });

  it("generates room codes using only unambiguous characters", async () => {
    localStorage.setItem("karaoq_host_name", "Tester");
    render(<Home />);

    const hostBtns = screen.getAllByRole("button", { name: /Host a Session/i });
    fireEvent.click(hostBtns[0]);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalled();
    });

    const path = mockPush.mock.calls[0][0] as string;
    const code = path.split("/").pop()!;

    expect(code).toMatch(/^[A-Z2-9]{5}$/);
    expect(code).not.toMatch(/[01OIL]/);
  });

  it("shows code input when Join a Session is clicked", () => {
    render(<Home />);

    // Click the first "Join a Session" button (hero)
    const joinBtns = screen.getAllByRole("button", { name: /Join a Session/i });
    fireEvent.click(joinBtns[0]);

    expect(screen.getByPlaceholderText("ROOM CODE")).toBeInTheDocument();
  });

  it("navigates to sing view with uppercase code on join", () => {
    render(<Home />);

    const joinBtns = screen.getAllByRole("button", { name: /Join a Session/i });
    fireEvent.click(joinBtns[0]);

    const input = screen.getByPlaceholderText("ROOM CODE");
    fireEvent.change(input, { target: { value: "abc12" } });

    // The submit button says "Join" (not "Join a Session")
    const submitBtns = screen.getAllByRole("button", { name: /^Join$/i });
    fireEvent.click(submitBtns[submitBtns.length - 1]);

    expect(mockPush).toHaveBeenCalledWith("/sing/ABC12");
  });

  it("disables submit button when code is empty", () => {
    render(<Home />);

    const joinBtns = screen.getAllByRole("button", { name: /Join a Session/i });
    fireEvent.click(joinBtns[0]);

    const submitBtns = screen.getAllByRole("button", { name: /^Join$/i });
    const submitBtn = submitBtns[submitBtns.length - 1];
    expect(submitBtn).toBeDisabled();
  });

  it("supports Enter key to join", () => {
    render(<Home />);

    const joinBtns = screen.getAllByRole("button", { name: /Join a Session/i });
    fireEvent.click(joinBtns[0]);

    const input = screen.getByPlaceholderText("ROOM CODE");
    fireEvent.change(input, { target: { value: "ROOM1" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(mockPush).toHaveBeenCalledWith("/sing/ROOM1");
  });
});
