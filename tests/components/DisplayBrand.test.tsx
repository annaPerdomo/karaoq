import { describe, it, expect, vi, beforeEach } from "vitest";
import * as React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { en } from "../../lib/i18n/messages";
import { DEFAULT_DISPLAY_CONFIG, RoomBrand } from "../../pages/api/types";

vi.mock("next/router", () => ({
  useRouter: () => ({ query: { joinCode: "room1" } }),
}));

const getRoom = vi.fn();
vi.mock("../../app/queue/getRoom", () => ({
  default: (...args: unknown[]) => getRoom(...args),
}));

import Display from "../../components/Display";
import { EditBar } from "../../components/edit/EditBar";
import { useDisplayEdit } from "../../components/display/edit/useDisplayEdit";

const HASH = "0123456789abcdef";
const fetchMock = vi.fn();

function room(brand?: RoomBrand) {
  return {
    id: "ROOM1",
    queue: [],
    activeVideoIndex: 0,
    isPlaying: false,
    displayConnected: true,
    ...(brand ? { brand } : {}),
  };
}

beforeEach(() => {
  getRoom.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("Display brand", () => {
  it("renders the club logo and applies the brand accent", async () => {
    getRoom.mockResolvedValue(room({ logo: HASH, accentA: "#123456" }));
    const { container } = render(<Display />);
    const logo = await screen.findByAltText(en["brand.logoAlt"]);
    expect(logo).toHaveAttribute("src", `/api/queue/ROOM1/logo?h=${HASH}`);
    const main = container.querySelector("main")!;
    expect(main.style.getPropertyValue("--acc-a")).toBe("#123456");
    // The wordmark stays.
    expect(screen.getByText("KaraoQ", { selector: "div" })).toBeInTheDocument();
  });

  it("keeps its own stored theme — the config routes mirror the two on save", async () => {
    getRoom.mockResolvedValue({
      ...room(),
      hostConfig: { theme: "neon" },
      displayConfig: { ...DEFAULT_DISPLAY_CONFIG, theme: "minimal" },
    });
    const { container } = render(<Display />);
    await waitFor(() => expect(container.querySelector("main")!.className).toMatch(/themeMinimal/));
  });

  it("renders no logo when the brand has none", async () => {
    getRoom.mockResolvedValue(room());
    const { container } = render(<Display />);
    await waitFor(() => expect(container.querySelector("main")).not.toBeNull());
    await waitFor(() => expect(getRoom).toHaveBeenCalled());
    expect(screen.queryByAltText(en["brand.logoAlt"])).toBeNull();
    expect(container.querySelector("main")!.style.getPropertyValue("--acc-a")).toBe("");
  });
});

function editHarness(brand: RoomBrand) {
  const onSaved = vi.fn();
  const state: { hook?: ReturnType<typeof useDisplayEdit> } = {};
  function Probe() {
    state.hook = useDisplayEdit({
      joinCode: "ROOM1",
      config: DEFAULT_DISPLAY_CONFIG,
      boardsOn: true,
      brand,
      onSaved,
    });
    return null;
  }
  render(<Probe />);
  return {
    onSaved,
    get hook() {
      return state.hook!;
    },
  };
}

const urls = () => fetchMock.mock.calls.map(([url]) => String(url));

describe("Display edit brand draft", () => {
  it("saves without a brand write when the brand is unchanged", async () => {
    const h = editHarness({ accentA: "#123456" });
    await act(async () => h.hook.enter());
    await act(async () => h.hook.change({ theme: "neon" }));
    await act(async () => h.hook.save());
    expect(urls()).toEqual(["/api/queue/ROOM1/display-config"]);
  });

  it("posts the brand with surface display when it changed", async () => {
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => (url.endsWith("/brand") ? { brand: { accentA: "#abcdef" } } : {}),
    }));
    const h = editHarness({});
    await act(async () => h.hook.enter());
    await act(async () => h.hook.brandControls.onChange({ accentA: "#abcdef" }));
    expect(h.hook.dirty).toBe(true);
    await act(async () => h.hook.save());
    expect(urls()).toEqual(["/api/queue/ROOM1/display-config", "/api/queue/ROOM1/brand"]);
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body).toEqual({ brand: { accentA: "#abcdef" }, surface: "display" });
    expect(h.onSaved).toHaveBeenCalledWith(DEFAULT_DISPLAY_CONFIG, true, { accentA: "#abcdef" });
    expect(h.hook.brandView).toEqual({ accentA: "#abcdef" });
  });

  it("stays in edit with the failure shown when the brand write fails", async () => {
    fetchMock.mockImplementation(async (url: string) => ({
      ok: !url.endsWith("/brand"),
      status: url.endsWith("/brand") ? 500 : 200,
      json: async () => ({}),
    }));
    const h = editHarness({});
    await act(async () => h.hook.enter());
    await act(async () => h.hook.brandControls.onChange({ logo: HASH }));
    await act(async () => h.hook.save());
    expect(h.hook.saveFailed).toBe(true);
    expect(h.hook.editing).toBe(true);
    expect(h.onSaved).not.toHaveBeenCalled();
  });

  it("discard leaves the live brand", async () => {
    const h = editHarness({ logo: HASH });
    await act(async () => h.hook.enter());
    await act(async () => h.hook.brandControls.onChange({ accentB: "#000000" }));
    expect(h.hook.brandView).toEqual({ accentB: "#000000" });
    await act(async () => h.hook.discard());
    expect(h.hook.brandView).toEqual({ logo: HASH });
    expect(h.hook.dirty).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dragging the logo handle stages logoScale, posted only when it differs, discard reverts it", async () => {
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => (url.endsWith("/brand") ? { brand: { logo: HASH, logoScale: 1.4 } } : {}),
    }));
    const h = editHarness({ logo: HASH });
    await act(async () => h.hook.enter());
    await act(async () =>
      h.hook.brandControls.onChange({ ...h.hook.brandControls.brand, logoScale: 1.4 })
    );
    await act(async () => h.hook.save());
    expect(urls()).toEqual(["/api/queue/ROOM1/display-config", "/api/queue/ROOM1/brand"]);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      brand: { logo: HASH, logoScale: 1.4 },
      surface: "display",
    });

    fetchMock.mockClear();
    await act(async () => h.hook.enter());
    await act(async () =>
      h.hook.brandControls.onChange({ ...h.hook.brandControls.brand, logoScale: 1.9 })
    );
    await act(async () => h.hook.discard());
    expect(h.hook.brandView.logoScale).toBe(1.4);

    await act(async () => h.hook.enter());
    await act(async () => h.hook.save());
    expect(urls()).toEqual(["/api/queue/ROOM1/display-config"]);
  });

  it("retries only the failed brand write, not the config that already landed", async () => {
    let brandOk = false;
    fetchMock.mockImplementation(async (url: string) => {
      const isBrand = url.endsWith("/brand");
      return {
        ok: !isBrand || brandOk,
        status: isBrand && !brandOk ? 500 : 200,
        json: async () => (isBrand ? { brand: { logo: HASH } } : {}),
      };
    });
    const h = editHarness({});
    await act(async () => h.hook.enter());
    await act(async () => h.hook.change({ theme: "neon" }));
    await act(async () => h.hook.brandControls.onChange({ logo: HASH }));
    await act(async () => h.hook.save());
    expect(h.hook.saveFailed).toBe(true);

    fetchMock.mockClear();
    brandOk = true;
    await act(async () => h.hook.save());
    expect(urls()).toEqual(["/api/queue/ROOM1/brand"]);
    expect(h.hook.editing).toBe(false);
  });

  it("blocks Save and Discard while a logo upload is in flight", async () => {
    const h = editHarness({});
    await act(async () => h.hook.enter());
    await act(async () => h.hook.brandControls.onBusyChange(true));
    expect(h.hook.dirty).toBe(true);
    expect(h.hook.saving).toBe(true);
    await act(async () => h.hook.save());
    expect(fetchMock).not.toHaveBeenCalled();

    render(
      <EditBar
        dirty={h.hook.dirty}
        saving={h.hook.saving}
        saveFailed={false}
        onDiscard={() => {}}
        onSave={() => {}}
      />
    );
    expect(screen.getByText(en["customize.apply"])).toBeDisabled();
    expect(screen.getByText(en["customize.discard"])).toBeDisabled();

    await act(async () => h.hook.brandControls.onBusyChange(false));
    expect(h.hook.saving).toBe(false);
    expect(h.hook.dirty).toBe(false);
  });
});
