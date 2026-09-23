import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EditOverlay } from "../../components/edit/EditOverlay";

function baseProps(overrides: Partial<React.ComponentProps<typeof EditOverlay>> = {}) {
  return {
    rail: <div>rail</div>,
    dirty: false,
    saving: false,
    saveFailed: false,
    onDiscard: () => {},
    onSave: () => {},
    sideDragTarget: null,
    sidebarPosition: "right" as const,
    onFlipSide: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  document.documentElement.removeAttribute("data-tv");
});

describe("EditOverlay side flip", () => {
  it("clicking the right drop zone calls the side-flip with 'right'", () => {
    const onFlipSide = vi.fn();
    render(<EditOverlay {...baseProps({ sideDragTarget: "left", onFlipSide })} />);
    fireEvent.click(screen.getByText("Right"));
    expect(onFlipSide).toHaveBeenCalledWith("right");
  });

  it("on TV, without a drag, shows a single pill for the side the sidebar isn't on", () => {
    document.documentElement.setAttribute("data-tv", "1");
    const onFlipSide = vi.fn();
    render(<EditOverlay {...baseProps({ sideDragTarget: null, sidebarPosition: "right", onFlipSide })} />);
    const pills = screen.getAllByLabelText("Move sidebar here");
    expect(pills).toHaveLength(1);
    fireEvent.click(pills[0]);
    expect(onFlipSide).toHaveBeenCalledWith("left");
  });

  it("off TV, no zone renders without an active drag", () => {
    render(<EditOverlay {...baseProps({ sideDragTarget: null })} />);
    expect(screen.queryByLabelText("Move sidebar here")).toBeNull();
  });
});
