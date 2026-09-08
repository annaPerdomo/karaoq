import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as React from "react";
import { render, screen, act } from "@testing-library/react";

import { AutoStartPanel } from "../../components/host/AutoStartPanel";
import { CHEER_FADE_SECONDS, cheerRevealSeconds } from "../../components/host/stageTiming";
import { en } from "../../lib/i18n/messages";

const GAP = 60;
const REVEAL = cheerRevealSeconds(GAP, true);

function Panel({ gapSeconds = GAP }: { gapSeconds?: number }) {
  return (
    <AutoStartPanel
      secondsLeft={gapSeconds}
      gapSeconds={gapSeconds}
      autoEnabled
      showCheer
      songsSung={1}
      lastSinger="Ana"
      singerName="Bea"
      songTitle="Dancing Queen"
    />
  );
}

const cheerText = en["host.autoStart.cheer"].replace("{name}", "Ana");

function advance(seconds: number) {
  act(() => {
    vi.advanceTimersByTime(seconds * 1000);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.documentElement.removeAttribute("data-tv");
});

describe("AutoStartPanel hand-off", () => {
  it("keeps the cheer until its fade-out has run, then shows Up Next", () => {
    render(<Panel />);
    expect(screen.getByText(cheerText)).toBeInTheDocument();

    advance(REVEAL + CHEER_FADE_SECONDS - 0.1);
    expect(screen.getByText(cheerText)).toBeInTheDocument();

    advance(0.2);
    expect(screen.queryByText(cheerText)).toBeNull();
    expect(screen.getByText("Bea")).toBeInTheDocument();
  });

  it("stays handed over when the host shortens the gap mid-countdown", () => {
    const { rerender } = render(<Panel />);
    advance(REVEAL + CHEER_FADE_SECONDS + 0.1);
    expect(screen.queryByText(cheerText)).toBeNull();

    rerender(<Panel gapSeconds={10} />);
    expect(screen.queryByText(cheerText)).toBeNull();
    expect(screen.getByText("Bea")).toBeInTheDocument();
  });

  it("hands over on a TV the moment the reveal is up, as no fade runs there", () => {
    document.documentElement.setAttribute("data-tv", "1");
    render(<Panel />);

    advance(REVEAL - 0.1);
    expect(screen.getByText(cheerText)).toBeInTheDocument();

    advance(0.2);
    expect(screen.queryByText(cheerText)).toBeNull();
  });
});

describe("AutoStartPanel TV repaint nudge", () => {
  function stage(): HTMLElement {
    return screen.getByText("Bea").closest("[style]") as HTMLElement;
  }

  it("dirties the stage's opacity for a frame when a TV hands over", () => {
    document.documentElement.setAttribute("data-tv", "1");
    render(<Panel />);
    advance(REVEAL + 0.1);
    expect(stage().style.opacity).toBe("0.999");
  });

  it("leaves the stage alone on a TV that opens straight on Up Next", () => {
    document.documentElement.setAttribute("data-tv", "1");
    render(
      <AutoStartPanel
        secondsLeft={GAP}
        gapSeconds={GAP}
        autoEnabled
        showCheer={false}
        songsSung={0}
        lastSinger=""
        singerName="Bea"
        songTitle="Dancing Queen"
      />
    );
    expect(stage().style.opacity).toBe("");
  });

  it("leaves the stage alone off a TV", () => {
    render(<Panel />);
    advance(REVEAL + CHEER_FADE_SECONDS + 0.1);
    expect(stage().style.opacity).toBe("");
  });
});
