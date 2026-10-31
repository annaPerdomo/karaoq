import { describe, it, expect, vi, beforeEach } from "vitest";
import * as React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import ClubLogo from "../../components/brand/ClubLogo";
import { en } from "../../lib/i18n/messages";
import { AUTO_ADVANCE_OFF, DEFAULT_HOST_CONFIG, RoomBrand } from "../../pages/api/types";
import { HostHeader } from "../../components/host/HostHeader";
import { ConfigRail } from "../../components/edit/ConfigRail";
import { hostRailToggles } from "../../components/host/edit/railToggles";
import { useHostEdit } from "../../components/host/edit/useHostEdit";

const HASH = "0123456789abcdef";
const noop = () => {};
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () => (url.endsWith("/brand") ? { brand: {} } : {}),
  }));
  global.fetch = fetchMock as unknown as typeof fetch;
});

function header(logo: string | undefined) {
  return render(
    <HostHeader
      roomId="ROOM1"
      logo={logo}
      logoScale={1}
      onLogoScaleChange={noop}
      remote={false}
      tvMode={false}
      customizing={false}
      canCustomize
      onCustomize={noop}
      modeMenuOpen={false}
      onModePillClick={noop}
      onModeMenuBackdropClick={noop}
      onPlayHere={noop}
      onOpenTvDisplay={noop}
      settingsOpen={false}
      onGearClick={noop}
      onSettingsClose={noop}
      reactionsOn
      onToggleReactions={noop}
      fairMode={false}
      onToggleFairMode={noop}
      autoAdvance={AUTO_ADVANCE_OFF}
      onChangeAutoAdvance={noop}
      songLimit={null}
      onChangeSongLimit={noop}
      sessionEndsAt={null}
      onChangeSessionEnd={noop}
      hostName="Anna"
      onChangeName={noop}
      onInviteCohost={noop}
      onPrintQr={noop}
      onSendFeedback={noop}
      onOpenMusicVideo={noop}
      onCopyMusicVideoLink={noop}
      onBrandClick={noop}
    />
  );
}

describe("Host brand", () => {
  it("renders the club logo before the KaraoQ wordmark", () => {
    header(HASH);
    const logo = screen.getByAltText(en["brand.logoAlt"]);
    expect(logo).toHaveAttribute("src", `/api/queue/ROOM1/logo?h=${HASH}`);
    const wordmark = screen.getByText("KaraoQ");
    expect(logo.compareDocumentPosition(wordmark) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders no logo without a brand logo", () => {
    header(undefined);
    expect(screen.queryByAltText(en["brand.logoAlt"])).toBeNull();
  });

  it("host Customize rail shows the shared brand section after the theme", () => {
    const { container } = render(
      <ConfigRail
        side="left"
        hintKey="customize.hint.host"
        theme="classic"
        onPickTheme={noop}
        brand={{ roomId: "ROOM1", brand: {}, onChange: noop }}
        toggles={hostRailToggles(DEFAULT_HOST_CONFIG, noop)}
        bannerId="banner"
        bannerLine=""
        onBannerChange={noop}
        selected={null}
        onSelect={noop}
      />
    );
    const brandTitle = screen.getByText(en["brand.title"]);
    const themeTitle = screen.getByText(en["customize.theme"]);
    expect(themeTitle.compareDocumentPosition(brandTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(en["brand.upload"])).toBeInTheDocument();
    expect(container.querySelectorAll('input[type="color"]')).toHaveLength(2);
  });

  it("host edit save posts the brand with surface host only when it changed", async () => {
    const state: { hook?: ReturnType<typeof useHostEdit> } = {};
    const onSaved = vi.fn();
    function Probe({ brand }: { brand: RoomBrand }) {
      state.hook = useHostEdit({ joinCode: "ROOM1", config: DEFAULT_HOST_CONFIG, brand, onSaved });
      return null;
    }
    render(<Probe brand={{ logo: HASH }} />);

    await act(async () => state.hook!.enter());
    await act(async () => state.hook!.save());
    expect(fetchMock.mock.calls.map(([u]) => u)).toEqual(["/api/queue/ROOM1/host-config"]);

    fetchMock.mockClear();
    await act(async () => state.hook!.enter());
    await act(async () => state.hook!.brandControls.onChange({}));
    await act(async () => state.hook!.save());
    expect(fetchMock.mock.calls.map(([u]) => u)).toEqual([
      "/api/queue/ROOM1/host-config",
      "/api/queue/ROOM1/brand",
    ]);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ brand: {}, surface: "host" });
    expect(onSaved).toHaveBeenLastCalledWith(DEFAULT_HOST_CONFIG, {});
  });

  it("dragging the logo handle stages logoScale, saved only when it differs, discard reverts it", async () => {
    const state: { hook?: ReturnType<typeof useHostEdit> } = {};
    function Probe({ brand }: { brand: RoomBrand }) {
      state.hook = useHostEdit({ joinCode: "ROOM1", config: DEFAULT_HOST_CONFIG, brand, onSaved: noop });
      return null;
    }
    render(<Probe brand={{ logo: HASH }} />);

    await act(async () => state.hook!.enter());
    await act(async () =>
      state.hook!.brandControls.onChange({ ...state.hook!.brandControls.brand, logoScale: 1.4 })
    );
    expect(state.hook!.brandView.logoScale).toBe(1.4);

    await act(async () => state.hook!.save());
    expect(JSON.parse(fetchMock.mock.calls.at(-1)![1].body)).toEqual({
      brand: { logo: HASH, logoScale: 1.4 },
      surface: "host",
    });

    fetchMock.mockClear();
    await act(async () => state.hook!.enter());
    await act(async () =>
      state.hook!.brandControls.onChange({ ...state.hook!.brandControls.brand, logoScale: 1.9 })
    );
    await act(async () => state.hook!.discard());
    expect(state.hook!.brandView.logoScale).toBe(1.4);

    await act(async () => state.hook!.enter());
    await act(async () => state.hook!.save());
    expect(fetchMock.mock.calls.map(([u]) => u)).toEqual(["/api/queue/ROOM1/host-config"]);
  });

  it("host retry after a failed brand write doesn't re-post the config", async () => {
    let brandOk = false;
    fetchMock.mockImplementation(async (url: string) => {
      const isBrand = url.endsWith("/brand");
      return { ok: !isBrand || brandOk, status: 200, json: async () => ({ brand: {} }) };
    });
    const state: { hook?: ReturnType<typeof useHostEdit> } = {};
    function Probe() {
      state.hook = useHostEdit({ joinCode: "ROOM1", config: DEFAULT_HOST_CONFIG, brand: { logo: HASH }, onSaved: noop });
      return null;
    }
    render(<Probe />);
    await act(async () => state.hook!.enter());
    await act(async () => state.hook!.brandControls.onChange({}));
    await act(async () => state.hook!.save());
    expect(state.hook!.saveFailed).toBe(true);

    fetchMock.mockClear();
    brandOk = true;
    await act(async () => state.hook!.save());
    expect(fetchMock.mock.calls.map(([u]) => u)).toEqual(["/api/queue/ROOM1/brand"]);
  });

  it("shows a logo again after an earlier one failed to load", () => {
    const view = header(HASH);
    fireEvent.error(screen.getByAltText(en["brand.logoAlt"]));
    expect(screen.queryByAltText(en["brand.logoAlt"])).toBeNull();
    view.unmount();
    const { rerender } = render(<ClubLogo roomId="ROOM1" logo={HASH} className="x" />);
    fireEvent.error(screen.getByAltText(en["brand.logoAlt"]));
    rerender(<ClubLogo roomId="ROOM1" logo="fedcba9876543210" className="x" />);
    rerender(<ClubLogo roomId="ROOM1" logo={HASH} className="x" />);
    expect(screen.getByAltText(en["brand.logoAlt"])).toBeInTheDocument();
  });
});
