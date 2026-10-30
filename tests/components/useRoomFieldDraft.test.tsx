import { describe, it, expect, vi, afterEach } from "vitest";
import * as React from "react";
import { act, render } from "@testing-library/react";
import { useRoomFieldDraft } from "../../components/hooks/useRoomFieldDraft";
import { SAVE_SETTLE_MS } from "../../components/edit/useConfigEdit";
import { brandsEqual } from "../../lib/brandStyle";
import type { RoomBrand } from "../../pages/api/types";

function harness(initial: RoomBrand) {
  const state: { hook?: ReturnType<typeof useRoomFieldDraft<RoomBrand>> } = {};
  function Probe({ live }: { live: RoomBrand }) {
    state.hook = useRoomFieldDraft(live, brandsEqual);
    return null;
  }
  const view = render(<Probe live={initial} />);
  return {
    get hook() {
      return state.hook!;
    },
    poll: (live: RoomBrand) => act(() => void view.rerender(<Probe live={live} />)),
  };
}

afterEach(() => vi.useRealTimers());

describe("useRoomFieldDraft", () => {
  it("follows the live value while the draft is untouched", () => {
    const h = harness({});
    h.poll({ accentA: "#112233" });
    expect(h.hook.draft).toEqual({ accentA: "#112233" });
    expect(h.hook.dirty).toBe(false);
  });

  it("is dirty on change and keeps the edit over a later poll", () => {
    const h = harness({});
    act(() => h.hook.setDraft({ accentA: "#abcdef" }));
    expect(h.hook.dirty).toBe(true);
    h.poll({ accentB: "#000000" });
    expect(h.hook.draft).toEqual({ accentA: "#abcdef" });
  });

  it("reset returns the draft to the live value", () => {
    const h = harness({ logo: "0123456789abcdef" });
    act(() => h.hook.setDraft({}));
    act(() => h.hook.reset());
    expect(h.hook.draft).toEqual({ logo: "0123456789abcdef" });
    expect(h.hook.dirty).toBe(false);
  });

  it("ignores a stale poll inside the settle window after save", () => {
    vi.useFakeTimers();
    const h = harness({});
    const next = { accentA: "#abcdef" };
    act(() => h.hook.setDraft(next));
    act(() => h.hook.markSaved(next));
    h.poll({}); // fetched before the write landed
    expect(h.hook.settled).toEqual(next);
    expect(h.hook.dirty).toBe(false);

    // Never shield forever: with no echo, the server wins after the window.
    act(() => void vi.advanceTimersByTime(SAVE_SETTLE_MS));
    expect(h.hook.settled).toEqual({});
  });

  it("ends the settle window as soon as the server echoes the save", () => {
    const h = harness({});
    const next = { accentB: "#123456" };
    act(() => h.hook.setDraft(next));
    act(() => h.hook.markSaved(next));
    h.poll({ accentB: "#123456" });
    h.poll({ accentB: "#654321" }); // a later genuine change from the other surface
    expect(h.hook.settled).toEqual({ accentB: "#654321" });
  });

  it("works for primitives exactly as the boards draft did", () => {
    const state: { hook?: ReturnType<typeof useRoomFieldDraft<boolean>> } = {};
    function Probe({ live }: { live: boolean }) {
      state.hook = useRoomFieldDraft(live, (a, b) => a === b);
      return null;
    }
    const view = render(<Probe live />);
    act(() => state.hook!.setDraft(false));
    act(() => state.hook!.markSaved(false));
    act(() => void view.rerender(<Probe live />));
    expect(state.hook!.settled).toBe(false);
  });
});
