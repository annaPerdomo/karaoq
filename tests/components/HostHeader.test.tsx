import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { render, fireEvent } from "@testing-library/react";

import { HostHeader } from "../../components/host/HostHeader";

function baseProps(overrides: Partial<React.ComponentProps<typeof HostHeader>> = {}) {
  const noop = () => {};
  return {
    roomId: "ROOM1",
    logo: "0123456789abcdef",
    logoScale: 1,
    onLogoScaleChange: vi.fn(),
    remote: false,
    tvMode: false,
    customizing: true,
    canCustomize: true,
    onCustomize: noop,
    modeMenuOpen: false,
    onModePillClick: noop,
    onModeMenuBackdropClick: noop,
    onPlayHere: noop,
    onOpenTvDisplay: noop,
    settingsOpen: false,
    onGearClick: noop,
    onSettingsClose: noop,
    reactionsOn: true,
    onToggleReactions: noop,
    fairMode: false,
    onToggleFairMode: noop,
    autoAdvance: { enabled: false, gapSeconds: 60 },
    onChangeAutoAdvance: noop,
    songLimit: null,
    onChangeSongLimit: noop,
    sessionEndsAt: null,
    onChangeSessionEnd: noop,
    hostName: "Host",
    onChangeName: noop,
    onInviteCohost: noop,
    onPrintQr: noop,
    onSendFeedback: noop,
    onOpenMusicVideo: noop,
    onCopyMusicVideoLink: noop,
    onBrandClick: noop,
    ...overrides,
  };
}

describe("HostHeader logo resize handle", () => {
  it("is hidden without a logo, even while customizing", () => {
    const { container } = render(<HostHeader {...baseProps({ logo: undefined })} />);
    expect(container.querySelector('[aria-label="Logo size"]')).toBeNull();
  });

  it("is hidden when not customizing, even with a logo", () => {
    const { container } = render(<HostHeader {...baseProps({ customizing: false })} />);
    expect(container.querySelector('[aria-label="Logo size"]')).toBeNull();
  });

  it("shows the handle while customizing with a logo, and nudges logoScale on arrow keys", () => {
    const onLogoScaleChange = vi.fn();
    const { container } = render(
      <HostHeader {...baseProps({ logoScale: 1.2, onLogoScaleChange })} />
    );
    const handle = container.querySelector('[aria-label="Logo size"]')!;
    expect(handle).toBeTruthy();

    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(onLogoScaleChange).toHaveBeenCalledWith(1.3);
  });

  it("maps a scale of 1 to undefined before updating the brand draft, like Host.tsx wires it", () => {
    const onChange = vi.fn();
    const onLogoScaleChange = (scale: number) =>
      onChange({ logo: "hash", logoScale: scale === 1 ? undefined : scale });
    const { container } = render(
      <HostHeader {...baseProps({ logoScale: 0.9, onLogoScaleChange })} />
    );
    const handle = container.querySelector('[aria-label="Logo size"]')!;
    fireEvent.keyDown(handle, { key: "ArrowRight" }); // 0.9 + 0.1 = 1
    expect(onChange).toHaveBeenCalledWith({ logo: "hash", logoScale: undefined });
  });
});
