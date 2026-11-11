import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { TransportBar } from "../../components/host/TransportBar";
import { en } from "../../lib/i18n/messages";

vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));

function bar(external: boolean, over: Record<string, unknown> = {}) {
  return render(
    <TransportBar
      hideOnPhone={false}
      currentSong={{ id: "e1", userName: "Ana", songTitle: "S", videoId: "v" }}
      isPlaying
      tvMode={false}
      displayConnected
      displayPaused={false}
      playsVideoHere
      hereVideoPlaying
      activeIndex={0}
      queueLength={2}
      external={external}
      onPrevious={() => {}}
      onToggleDisplayPause={() => {}}
      onStop={() => {}}
      onToggleHereVideo={() => {}}
      onStart={() => {}}
      onNext={() => {}}
      {...over}
    />
  );
}

describe("TransportBar for an external entry", () => {
  it("drops the pause toggle but keeps Previous, Stop and Next", () => {
    const { container } = bar(true);
    expect(container.querySelector(`[title="${en["host.transport.pause"]}"]`)).toBeNull();
    expect(container.querySelector(`[title="${en["host.transport.stop"]}"]`)).not.toBeNull();
    expect(container.querySelector(`[title="${en["host.transport.next"]}"]`)).not.toBeNull();
    expect(container.querySelector(`[title="${en["host.transport.previous"]}"]`)).not.toBeNull();
  });

  it("drops the display pause toggle in separate-display mode", () => {
    const { container } = bar(true, { tvMode: true, playsVideoHere: false });
    expect(container.querySelector(`[title="${en["host.transport.pauseDisplay"]}"]`)).toBeNull();
  });

  it("keeps the toggle for a normal entry", () => {
    const { container } = bar(false);
    expect(container.querySelector(`[title="${en["host.transport.pause"]}"]`)).not.toBeNull();
  });
});
