import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

vi.mock("../../app/queue/postReaction", () => ({ default: vi.fn(async () => true) }));

import postReaction from "../../app/queue/postReaction";
import { useCheers } from "../../components/sing/hooks/useCheers";
import { REACTION_COOLDOWN_MS } from "../../app/queue/cheerConstants";

describe("useCheers cooldown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(postReaction).mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("drops a second tap in the same tick and lets one through after the cooldown", async () => {
    const { result } = renderHook(() => useCheers("ABCD", "Anna"));
    await act(async () => {
      void result.current.sendReaction("🔥");
      void result.current.sendReaction("👏");
    });
    expect(postReaction).toHaveBeenCalledTimes(1);
    expect(result.current.cooldown).toBe(true);

    act(() => {
      vi.advanceTimersByTime(REACTION_COOLDOWN_MS);
    });
    expect(result.current.cooldown).toBe(false);
    await act(async () => {
      void result.current.sendReaction("👏");
    });
    expect(postReaction).toHaveBeenCalledTimes(2);
  });
});
