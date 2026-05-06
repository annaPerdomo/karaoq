import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Home from "../../components/Home";

const mockPush = vi.fn();
vi.mock("next/router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

global.fetch = vi.fn().mockResolvedValue({ ok: true });

describe("Home component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
  });

  it("renders the app title and subtitle", () => {
    render(<Home />);

    expect(screen.getByText("KaraoQ")).toBeInTheDocument();
    expect(screen.getByText("Your one stop shop for YouTube Karaoke!")).toBeInTheDocument();
  });

  it("renders HOST and PLAY cards", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { name: "HOST" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "PLAY" })).toBeInTheDocument();
  });

  it("creates a room and navigates to host view on CREATE click", async () => {
    render(<Home />);

    const createBtn = screen.getByRole("button", { name: "CREATE" });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toMatch(/^\/api\/queue\/[A-Z2-9]{5}$/);
    expect(fetchCall[1]).toEqual({ method: "POST" });

    expect(mockPush).toHaveBeenCalledWith(expect.stringMatching(/^\/host\/[A-Z2-9]{5}$/));
  });

  it("generates room codes using only unambiguous characters", async () => {
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: "CREATE" }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalled();
    });

    const path = mockPush.mock.calls[0][0] as string;
    const code = path.split("/").pop()!;

    // Should not contain 0, O, 1, I, or L (ambiguous characters excluded by generateCode)
    expect(code).toMatch(/^[A-Z2-9]{5}$/);
    expect(code).not.toMatch(/[01OIL]/);
  });

  it("shows code input when JOIN is clicked", () => {
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: "JOIN" }));

    expect(screen.getByText("Enter Code")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("navigates to sing view with uppercase code on join", () => {
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: "JOIN" }));

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "abc12" } });

    // After expanding, there's a submit JOIN button inside the reveal
    const joinBtns = screen.getAllByRole("button", { name: "JOIN" });
    fireEvent.click(joinBtns[joinBtns.length - 1]);

    expect(mockPush).toHaveBeenCalledWith("/sing/ABC12");
  });

  it("disables submit button when code is empty", () => {
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: "JOIN" }));

    const joinBtns = screen.getAllByRole("button", { name: "JOIN" });
    const submitBtn = joinBtns[joinBtns.length - 1];
    expect(submitBtn).toBeDisabled();
  });

  it("supports Enter key to join", () => {
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: "JOIN" }));

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "ROOM1" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(mockPush).toHaveBeenCalledWith("/sing/ROOM1");
  });
});
