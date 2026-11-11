import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const postScreenEventMock = vi.fn();
vi.mock("../../../app/queue/screenEvent", () => ({
  default: (...args: unknown[]) => postScreenEventMock(...args),
}));

import { SongStage } from "../../../components/host/SongStage";
import { en } from "../../../lib/i18n/messages";

const SONG = { id: "e1", userName: "Ana", songTitle: "Dancing Queen", videoId: "dQw4w9WgXcQ" };

function stage(over: { external?: true; isPlaying?: boolean; onStartSong?: () => void } = {}) {
  const { external, isPlaying = false, onStartSong = vi.fn() } = over;
  const videoRef = { current: null };
  return render(
    <SongStage
      loading={false}
      currentSong={external ? { ...SONG, external } : SONG}
      songsSung={0}
      showCheer={false}
      lastSinger={undefined}
      remote={false}
      cohostCanPlay
      cohostControlsLive={false}
      tvMode={false}
      isPlaying={isPlaying}
      displayPaused={false}
      displayConnected
      playsVideoHere
      videoRef={videoRef}
      onIframeLoad={() => {}}
      onOpenTvDisplay={() => {}}
      onStartSong={onStartSong}
      joinCode="ABCD"
      onAddFirst={() => {}}
      autoStartIn={null}
      autoGapSeconds={10}
      autoEnabled={false}
      wrapUpIn={null}
      canPopOut={false}
    />
  );
}

beforeEach(() => vi.clearAllMocks());

describe("SongStage with an external entry", () => {
  it("renders the card instead of a player", () => {
    const { container } = stage({ external: true });
    expect(container.querySelector("iframe")).toBeNull();
    expect(screen.getByText(en["external.host.open"])).toBeInTheDocument();
  });

  it("starts the song and reports the first open only, even on a double click", () => {
    const onStartSong = vi.fn();
    const { rerender, container } = stage({ external: true, onStartSong });
    const link = screen.getByText(en["external.host.open"]);
    link.addEventListener("click", (e) => e.preventDefault());
    fireEvent.click(link);
    fireEvent.click(link);
    expect(onStartSong).toHaveBeenCalledTimes(1);
    expect(postScreenEventMock).toHaveBeenCalledTimes(1);
    expect(postScreenEventMock).toHaveBeenCalledWith("ABCD", "external_opened", { surface: "host" });
    expect(container.querySelector("iframe")).toBeNull();
    rerender(<div />);
  });

  it("lets the host retry when the first start never took", () => {
    vi.useFakeTimers();
    const onStartSong = vi.fn();
    stage({ external: true, onStartSong });
    const link = screen.getByText(en["external.host.open"]);
    link.addEventListener("click", (e) => e.preventDefault());
    fireEvent.click(link);
    vi.advanceTimersByTime(3100);
    fireEvent.click(link);
    expect(onStartSong).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("does not start again while already playing", () => {
    const onStartSong = vi.fn();
    stage({ external: true, isPlaying: true, onStartSong });
    const link = screen.getByText(en["external.host.reopen"]);
    link.addEventListener("click", (e) => e.preventDefault());
    fireEvent.click(link);
    expect(onStartSong).not.toHaveBeenCalled();
    expect(postScreenEventMock).not.toHaveBeenCalled();
  });

  it("still mounts the player for a normal entry", () => {
    const { container } = stage();
    expect(container.querySelector("iframe")).not.toBeNull();
  });
});
