import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";

import DisplayStage from "../../components/display/DisplayStage";
import { en } from "../../lib/i18n/messages";

let raiseError: ((e: { data: number }) => void) | null = null;
const FAKE_YT = {
  Player: function (_el: HTMLElement, opts: any) {
    raiseError = opts.events.onError;
    return { destroy: vi.fn() };
  },
};

const SONG = {
  id: "entry-1",
  videoId: "dQw4w9WgXcQ",
  songTitle: "Dancing Queen",
  userName: "Ana",
};

function Stage({ needsTap }: { needsTap: boolean }) {
  const ref = React.useRef<HTMLIFrameElement>(null);
  return (
    <DisplayStage
      loading={false}
      joinCode="ABCD"
      origin="https://karaoq.live"
      currentSong={SONG}
      isPlaying
      playsVideoHere
      videoRef={ref}
      onIframeLoad={() => {}}
      needsTap={needsTap}
      onUnlock={() => {}}
    />
  );
}

async function attach() {
  await waitFor(() => expect(raiseError).not.toBeNull());
}

beforeEach(() => {
  raiseError = null;
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true }) as Response));
  (window as any).YT = FAKE_YT;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as any).YT;
});

describe("DisplayStage", () => {
  it("offers the tap when autoplay was blocked", async () => {
    render(<Stage needsTap />);
    await attach();

    expect(screen.getByText(en["display.tapTitle"])).toBeInTheDocument();
  });

  it("drops the tap overlay once the video is the thing that can't play", async () => {
    render(<Stage needsTap />);
    await attach();

    act(() => {
      raiseError!({ data: 150 });
    });

    expect(screen.queryByText(en["display.tapTitle"])).toBeNull();
    expect(screen.getByText(en["player.unplayable"])).toBeInTheDocument();
  });
});
