import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TapHint } from "../../components/admin/TapHint";

function stubTouchFirst(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches }) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  stubTouchFirst(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TapHint", () => {
  it("keeps className on the child when there is no hint text", () => {
    render(<TapHint text="" className="badge">Search</TapHint>);

    expect(screen.getByText("Search")).toHaveClass("badge");
  });

  it("renders children and sets title to text", () => {
    render(<TapHint text="12 songs">×</TapHint>);

    const el = screen.getByText("×");
    expect(el.closest('[title]')).toHaveAttribute("title", "12 songs");
  });

  it("shows a tooltip on click (touch-first) and hides it on a second click", () => {
    render(<TapHint text="12 songs">×</TapHint>);
    const el = screen.getByText("×");

    fireEvent.click(el);
    expect(screen.getByRole("tooltip")).toHaveTextContent("12 songs");

    fireEvent.click(el);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("does nothing on click when the device isn't touch-first", () => {
    stubTouchFirst(false);
    render(<TapHint text="12 songs">×</TapHint>);

    fireEvent.click(screen.getByText("×"));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("stops propagation so a non-interactive parent's click handler does not fire", () => {
    const onParentClick = vi.fn();
    render(
      <div onClick={onParentClick}>
        <TapHint text="12 songs">×</TapHint>
      </div>
    );

    fireEvent.click(screen.getByText("×"));
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it("closes on a pointerdown outside the hint", () => {
    render(<TapHint text="12 songs">×</TapHint>);
    fireEvent.click(screen.getByText("×"));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("renders children only with no title and no tooltip when text is empty", () => {
    render(<TapHint text="">×</TapHint>);
    const el = screen.getByText("×");

    expect(el.closest('[title]')).not.toBeInTheDocument();
    fireEvent.click(el);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("toggles the tooltip on Enter regardless of device", () => {
    stubTouchFirst(false);
    render(<TapHint text="12 songs">×</TapHint>);

    fireEvent.keyDown(screen.getByText("×"), { key: "Enter" });
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    render(<TapHint text="12 songs">×</TapHint>);
    fireEvent.click(screen.getByText("×"));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByText("×"), { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
