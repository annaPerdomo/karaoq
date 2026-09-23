import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Spot, HideButton } from "../../components/edit/EditChrome";

describe("Spot keyboard selection", () => {
  it("Enter on a HideButton inside a Spot calls onHide and does not select the Spot", () => {
    const onSelect = vi.fn();
    const onHide = vi.fn();
    render(
      <Spot id="qr" selected={null} onSelect={onSelect} label="QR" chrome={<HideButton title="Hide" onHide={onHide} />}>
        <div>content</div>
      </Spot>
    );
    const hideBtn = screen.getByTitle("Hide");
    // jsdom won't synthesize the click a real Enter-on-<button> press produces.
    fireEvent.keyDown(hideBtn, { key: "Enter" });
    fireEvent.click(hideBtn);
    expect(onHide).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("Enter directly on the Spot still selects it", () => {
    const onSelect = vi.fn();
    render(
      <Spot id="qr" selected={null} onSelect={onSelect} label="QR">
        <div>content</div>
      </Spot>
    );
    fireEvent.keyDown(screen.getByRole("button", { name: "QR" }), { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("qr");
  });
});
