import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Disclosure from "../../components/admin/pulse/Disclosure";

describe("Disclosure", () => {
  it("is closed by default", () => {
    const { container } = render(
      <Disclosure summary="More detail">
        <p>hidden</p>
      </Disclosure>
    );
    expect(container.querySelector('details')?.open).toBe(false);
  });

  it("opens when defaultOpen is true", () => {
    const { container } = render(
      <Disclosure summary="More detail" defaultOpen>
        <p>hidden</p>
      </Disclosure>
    );
    expect(container.querySelector('details')?.open).toBe(true);
  });

  it("renders the summary and children", () => {
    render(
      <Disclosure summary="More detail">
        <p>child content</p>
      </Disclosure>
    );
    expect(screen.getByText('More detail')).toBeTruthy();
    expect(screen.getByText('child content')).toBeTruthy();
  });
});
