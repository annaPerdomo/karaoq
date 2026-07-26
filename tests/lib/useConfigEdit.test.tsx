import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { act, render } from "@testing-library/react";
import { useConfigEdit } from "../../components/edit/useConfigEdit";

interface Cfg {
  theme: string;
  sidebarPosition: "left" | "right";
  sidebarWidth: number;
  nowPlayingHeight: number;
}

const KEYS: (keyof Cfg)[] = [
  "theme",
  "sidebarPosition",
  "sidebarWidth",
  "nowPlayingHeight",
];
const BASE: Cfg = {
  theme: "classic",
  sidebarPosition: "right",
  sidebarWidth: 280,
  nowPlayingHeight: 132,
};

/** Drives the hook the way a page does; `config` is the poll-overwritten server value. */
function harness() {
  const save = vi.fn(async () => true);
  const state: { hook?: ReturnType<typeof useConfigEdit<Cfg, string>> } = {};

  function Probe({ config }: { config: Cfg }) {
    state.hook = useConfigEdit<Cfg, string>({
      joinCode: "ROOM1",
      config,
      keys: KEYS,
      nowPlayingBounds: { min: 100, max: 420 },
      save,
      onSaved: () => {},
    });
    return <div data-testid="theme">{state.hook.view.theme}</div>;
  }

  const view = render(<Probe config={BASE} />);
  return {
    save,
    get hook() {
      return state.hook!;
    },
    /** Simulate a poll delivering a (possibly stale) server config. */
    poll: (config: Cfg) => act(() => void view.rerender(<Probe config={config} />)),
    themeText: () => view.getByTestId("theme").textContent,
  };
}

describe("useConfigEdit", () => {
  it("renders the draft while editing and the server config otherwise", async () => {
    const h = harness();
    expect(h.themeText()).toBe("classic");

    await act(async () => h.hook.enter());
    await act(async () => h.hook.change({ theme: "neon" }));
    expect(h.themeText()).toBe("neon");
    expect(h.hook.dirty).toBe(true);

    await act(async () => h.hook.discard());
    expect(h.themeText()).toBe("classic");
  });

  // Regression: a poll in flight at save time used to revert the page on resolve.
  it("keeps the saved values when a poll predating the save arrives", async () => {
    const h = harness();
    await act(async () => h.hook.enter());
    await act(async () => h.hook.change({ theme: "neon" }));
    await act(async () => h.hook.save());
    expect(h.save).toHaveBeenCalledOnce();
    expect(h.themeText()).toBe("neon");

    h.poll(BASE); // stale — fetched before the write landed
    expect(h.themeText()).toBe("neon");

    h.poll({ ...BASE, theme: "neon" }); // server caught up
    expect(h.themeText()).toBe("neon");
  });

  // Nastier half: the stale poll also re-staled the draft, so a re-save wrote old values.
  it("does not re-stale the draft from a poll predating the save", async () => {
    const h = harness();
    await act(async () => h.hook.enter());
    await act(async () => h.hook.change({ theme: "neon" }));
    await act(async () => h.hook.save());

    h.poll(BASE);
    await act(async () => h.hook.enter());
    expect(h.hook.draft.theme).toBe("neon");

    await act(async () => h.hook.save());
    expect(h.save.mock.calls[1][1].theme).toBe("neon");
  });

  it("still follows a genuine co-host change while the draft is pristine", async () => {
    const h = harness();
    h.poll({ ...BASE, sidebarWidth: 400 });
    expect(h.hook.view.sidebarWidth).toBe(400);

    await act(async () => h.hook.enter());
    h.poll({ ...BASE, sidebarWidth: 420 });
    expect(h.hook.draft.sidebarWidth).toBe(420);
    expect(h.hook.dirty).toBe(false);
  });

  it("lets in-progress edits win over a mid-edit poll", async () => {
    const h = harness();
    await act(async () => h.hook.enter());
    await act(async () => h.hook.change({ theme: "minimal" }));

    h.poll({ ...BASE, sidebarWidth: 420 });
    expect(h.hook.draft.theme).toBe("minimal");
    expect(h.hook.draft.sidebarWidth).toBe(280);
    expect(h.hook.dirty).toBe(true);
  });

  it("surfaces a failed save and stays in edit mode", async () => {
    const h = harness();
    h.save.mockResolvedValueOnce(false);

    await act(async () => h.hook.enter());
    await act(async () => h.hook.change({ theme: "neon" }));
    await act(async () => h.hook.save());

    expect(h.hook.saveFailed).toBe(true);
    expect(h.hook.editing).toBe(true);
    expect(h.themeText()).toBe("neon");
  });
});
