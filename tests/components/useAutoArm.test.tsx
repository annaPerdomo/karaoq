import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import * as React from "react";
import { useAutoArm } from "../../components/hooks/useAutoArm";

const armAutoStart = vi.fn();
vi.mock("../../app/queue/armAutoStart", () => ({
  default: (...args: unknown[]) => armAutoStart(...args),
}));

type Props = {
  enabled?: boolean;
  isPlaying?: boolean;
  autoStartAt?: number | null;
  activeIndex?: number;
  hasCurrent?: boolean;
  claimNonce?: number;
};

function render(initial: Props = {}) {
  const setAutoStartAt = vi.fn();
  const isPausedRef = { current: false } as React.MutableRefObject<boolean>;
  const hook = renderHook(
    (p: Props) =>
      useAutoArm({
        roomId: "ROOM1",
        enabled: p.enabled ?? true,
        isPlaying: p.isPlaying ?? false,
        autoStartAt: p.autoStartAt ?? null,
        activeIndex: p.activeIndex ?? 2,
        hasCurrent: p.hasCurrent ?? true,
        claimNonce: p.claimNonce ?? 0,
        isPausedRef,
        setAutoStartAt,
      }),
    { initialProps: initial }
  );
  return { ...hook, setAutoStartAt, isPausedRef };
}

const flush = () => act(async () => {});

describe("useAutoArm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    armAutoStart.mockResolvedValue(null);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
  });

  it("asks once per index and adopts the stamp it gets back", async () => {
    armAutoStart.mockResolvedValue(1_000);
    const { rerender, setAutoStartAt } = render();
    await flush();
    expect(armAutoStart).toHaveBeenCalledTimes(1);
    expect(setAutoStartAt).toHaveBeenCalledWith(1_000);

    rerender({ claimNonce: 0 });
    rerender({ hasCurrent: true });
    await flush();
    expect(armAutoStart).toHaveBeenCalledTimes(1);
  });

  it("re-arms a countdown that was adopted and then lapsed", async () => {
    armAutoStart.mockResolvedValue(1_000);
    const { rerender } = render();
    await flush();
    expect(armAutoStart).toHaveBeenCalledTimes(1);

    rerender({ autoStartAt: 1_000 });
    rerender({ autoStartAt: null, claimNonce: 1 });
    await flush();
    expect(armAutoStart).toHaveBeenCalledTimes(2);
  });

  it("does not ask after the page's own Stop or Cancel", async () => {
    const { result, rerender } = render({ autoStartAt: 1_000 });
    await flush();
    expect(armAutoStart).not.toHaveBeenCalled();

    act(() => result.current.hold());
    rerender({ autoStartAt: null });
    await flush();
    expect(armAutoStart).not.toHaveBeenCalled();
  });

  it("re-times a first song whose count-in lapsed with nobody watching", async () => {
    // Nothing clears the stamp the videos route left, so index 0 must re-arm.
    await flush();
    render({ activeIndex: 0 });
    await flush();
    expect(armAutoStart).toHaveBeenCalledTimes(1);
  });

  it("waits for a playing room or a hidden tab", async () => {
    const { rerender } = render({ isPlaying: true });
    await flush();
    expect(armAutoStart).not.toHaveBeenCalled();

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    rerender({ isPlaying: false, claimNonce: 1 });
    await flush();
    expect(armAutoStart).not.toHaveBeenCalled();

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    rerender({ isPlaying: false, claimNonce: 2 });
    await flush();
    expect(armAutoStart).toHaveBeenCalledTimes(1);
  });

  it("drops a stamp that lands while polling is held", async () => {
    armAutoStart.mockResolvedValue(1_000);
    const { setAutoStartAt, isPausedRef } = render();
    isPausedRef.current = true;
    await flush();
    expect(armAutoStart).toHaveBeenCalledTimes(1);
    expect(setAutoStartAt).not.toHaveBeenCalled();
  });
});
