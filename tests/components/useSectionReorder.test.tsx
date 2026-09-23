import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { renderHook, render, screen, fireEvent } from "@testing-library/react";
import { useSectionReorder } from "../../components/edit/hooks/useSectionReorder";

type S = "a" | "b" | "c";

function keyEvent(key: string) {
  return {
    key,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as React.KeyboardEvent;
}

describe("useSectionReorder keyboard support", () => {
  const order: S[] = ["a", "b", "c"];
  const visible: Record<S, boolean> = { a: true, b: true, c: true };

  it("ArrowDown on the first grip moves it to index 1 as a permutation", () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() => useSectionReorder<S>({ order, visible, onReorder }));
    result.current.gripProps("a").onKeyDown!(keyEvent("ArrowDown"));
    expect(onReorder).toHaveBeenCalledTimes(1);
    const next = onReorder.mock.calls[0][0] as S[];
    expect(next.indexOf("a")).toBe(1);
    expect([...next].sort()).toEqual([...order].sort());
  });

  it("ArrowUp on the first grip is a no-op with no commit", () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() => useSectionReorder<S>({ order, visible, onReorder }));
    result.current.gripProps("a").onKeyDown!(keyEvent("ArrowUp"));
    expect(onReorder).not.toHaveBeenCalled();
  });
});

function GripList() {
  const [order, setOrder] = React.useState<S[]>(["a", "b", "c"]);
  const visible: Record<S, boolean> = { a: true, b: true, c: true };
  const { gripProps } = useSectionReorder<S>({ order, visible, onReorder: setOrder });
  return (
    <div>
      {order.map((id) => (
        <button key={id} {...gripProps(id)}>
          {id}
        </button>
      ))}
    </div>
  );
}

async function nextFrame() {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

describe("useSectionReorder focus retention", () => {
  it("stays on the moved grip after ArrowDown", async () => {
    render(<GripList />);
    screen.getByText("a").focus();
    fireEvent.keyDown(screen.getByText("a"), { key: "ArrowDown" });
    await nextFrame();
    expect(document.activeElement?.getAttribute("data-grip")).toBe("a");
  });

  it("stays on the moved grip after ArrowUp", async () => {
    render(<GripList />);
    screen.getByText("b").focus();
    fireEvent.keyDown(screen.getByText("b"), { key: "ArrowUp" });
    await nextFrame();
    expect(document.activeElement?.getAttribute("data-grip")).toBe("b");
  });
});
