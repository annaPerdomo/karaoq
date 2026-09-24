import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useScalarDrag } from "../../components/edit/hooks/useScalarDrag";

function keyEvent(key: string) {
  return {
    key,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as React.KeyboardEvent;
}

describe("useScalarDrag keyboard support", () => {
  it("ArrowRight increases by step and commits once", () => {
    const onChange = vi.fn();
    const onEnd = vi.fn();
    const { result } = renderHook(() =>
      useScalarDrag({ value: 100, min: 0, max: 200, axis: "x", step: 20, onChange, onEnd })
    );
    const e = keyEvent("ArrowRight");
    result.current.onKeyDown(e);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(120);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("clamps at max", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useScalarDrag({ value: 195, min: 0, max: 200, axis: "x", step: 20, onChange })
    );
    result.current.onKeyDown(keyEvent("ArrowRight"));
    expect(onChange).toHaveBeenCalledWith(200);
  });

  it("invert flips the increasing direction", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useScalarDrag({ value: 100, min: 0, max: 200, axis: "x", step: 20, invert: true, onChange })
    );
    result.current.onKeyDown(keyEvent("ArrowRight"));
    expect(onChange).toHaveBeenCalledWith(80);
  });

  it("Home and End jump to the bounds", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useScalarDrag({ value: 100, min: 0, max: 200, axis: "x", onChange })
    );
    result.current.onKeyDown(keyEvent("Home"));
    expect(onChange).toHaveBeenCalledWith(0);
    result.current.onKeyDown(keyEvent("End"));
    expect(onChange).toHaveBeenCalledWith(200);
  });

  it("ignores unrelated keys without calling preventDefault", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useScalarDrag({ value: 100, min: 0, max: 200, axis: "x", onChange })
    );
    const e = keyEvent("Tab");
    result.current.onKeyDown(e);
    expect(onChange).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });
});
