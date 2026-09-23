import { describe, it, expect, vi, afterEach } from "vitest";
import * as React from "react";
import { render, cleanup } from "@testing-library/react";
import { useRemoteNav } from "../../components/display/hooks/useRemoteNav";

function stubRect(el: HTMLElement, rect: { left: number; top: number; width: number; height: number }) {
  el.getBoundingClientRect = () =>
    ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top, toJSON() {} }) as DOMRect;
  Object.defineProperty(el, "offsetParent", { value: document.body, configurable: true });
}

function Harness({
  enabled,
  onBack,
}: {
  enabled: boolean;
  onBack?: () => void;
}) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  useRemoteNav(rootRef as React.RefObject<HTMLElement>, { enabled, onBack });
  return (
    <div ref={rootRef}>
      <button data-testid="a">A</button>
      <button data-testid="b">B</button>
      <input data-testid="input" />
    </div>
  );
}

afterEach(cleanup);

describe("useRemoteNav", () => {
  it("moves focus between two buttons on ArrowRight", () => {
    const { getByTestId } = render(<Harness enabled />);
    const a = getByTestId("a");
    const b = getByTestId("b");
    stubRect(a, { left: 0, top: 0, width: 50, height: 50 });
    stubRect(b, { left: 100, top: 0, width: 50, height: 50 });

    a.focus();
    expect(document.activeElement).toBe(a);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));

    expect(document.activeElement).toBe(b);
  });

  it("ignores an event that is already defaultPrevented", () => {
    const { getByTestId } = render(<Harness enabled />);
    const a = getByTestId("a");
    const b = getByTestId("b");
    stubRect(a, { left: 0, top: 0, width: 50, height: 50 });
    stubRect(b, { left: 100, top: 0, width: 50, height: 50 });

    a.focus();
    const event = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true });
    event.preventDefault();
    window.dispatchEvent(event);

    expect(document.activeElement).toBe(a);
  });

  it("ignores arrow keys while focus is inside an input", () => {
    const { getByTestId } = render(<Harness enabled />);
    const input = getByTestId("input");
    stubRect(getByTestId("a"), { left: 0, top: 0, width: 50, height: 50 });
    stubRect(getByTestId("b"), { left: 100, top: 0, width: 50, height: 50 });
    stubRect(input, { left: 200, top: 0, width: 50, height: 50 });

    input.focus();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));

    expect(document.activeElement).toBe(input);
  });

  it("still handles Back while focus is inside an input", () => {
    const onBack = vi.fn();
    const { getByTestId } = render(<Harness enabled onBack={onBack} />);
    const input = getByTestId("input");
    input.focus();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("calls onBack only when provided", () => {
    const onBack = vi.fn();
    render(<Harness enabled onBack={onBack} />);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(onBack).toHaveBeenCalledTimes(1);

    cleanup();
    expect(() => {
      render(<Harness enabled />);
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    }).not.toThrow();
  });

  it("adds no listener when disabled", () => {
    const spy = vi.spyOn(window, "addEventListener");
    render(<Harness enabled={false} />);
    const keydownCalls = spy.mock.calls.filter(([type]) => type === "keydown");
    expect(keydownCalls.length).toBe(0);
    spy.mockRestore();
  });
});
