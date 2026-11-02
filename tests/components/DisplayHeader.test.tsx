import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { render, fireEvent } from "@testing-library/react";

import DisplayHeader from "../../components/display/DisplayHeader";

function baseProps(overrides: Partial<React.ComponentProps<typeof DisplayHeader>> = {}) {
  return {
    joinCode: "ROOM1",
    logo: "0123456789abcdef",
    logoScale: 1,
    onLogoScaleChange: vi.fn(),
    editing: true,
    sidebarCollapsed: false,
    showCustomize: false,
    onCustomize: () => {},
    ...overrides,
  };
}

describe("DisplayHeader logo resize handle", () => {
  it("is hidden without a logo, even while editing", () => {
    const { container } = render(<DisplayHeader {...baseProps({ logo: undefined })} />);
    expect(container.querySelector('[aria-label="Logo size"]')).toBeNull();
  });

  it("is hidden when not editing, even with a logo", () => {
    const { container } = render(<DisplayHeader {...baseProps({ editing: false })} />);
    expect(container.querySelector('[aria-label="Logo size"]')).toBeNull();
  });

  it("shows the handle while editing with a logo, and nudges logoScale on arrow keys", () => {
    const onLogoScaleChange = vi.fn();
    const { container } = render(
      <DisplayHeader {...baseProps({ logoScale: 1.2, onLogoScaleChange })} />
    );
    const handle = container.querySelector('[aria-label="Logo size"]')!;
    expect(handle).toBeTruthy();

    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(onLogoScaleChange).toHaveBeenCalledWith(1.3);
  });

  it("maps a scale of 1 to undefined before updating the brand draft, like Display.tsx wires it", () => {
    const onChange = vi.fn();
    const onLogoScaleChange = (scale: number) =>
      onChange({ logo: "hash", logoScale: scale === 1 ? undefined : scale });
    const { container } = render(
      <DisplayHeader {...baseProps({ logoScale: 0.9, onLogoScaleChange })} />
    );
    const handle = container.querySelector('[aria-label="Logo size"]')!;
    fireEvent.keyDown(handle, { key: "ArrowRight" }); // 0.9 + 0.1 = 1
    expect(onChange).toHaveBeenCalledWith({ logo: "hash", logoScale: undefined });
  });
});
