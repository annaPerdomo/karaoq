import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { render } from "@testing-library/react";

import MusicVideoPlayer from "../../components/musicvideo/MusicVideoPlayer";

function Player() {
  const ref = React.useRef<HTMLIFrameElement>(null);
  return (
    <MusicVideoPlayer videoId="dQw4w9WgXcQ" videoRef={ref} onInfo={() => {}} onError={() => {}} />
  );
}

describe("MusicVideoPlayer", () => {
  it("renders a muted iframe for the given video id", () => {
    const { container } = render(<Player />);
    const iframe = container.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe!.src).toContain("dQw4w9WgXcQ");
    expect(iframe!.src).toContain("mute=1");
  });
});

describe("MusicVideoPlayer captions", () => {
  it("unloads captions on every start of playback", () => {
    const { container } = render(<Player />);
    const iframe = container.querySelector("iframe")!;
    const post = vi.fn();
    Object.defineProperty(iframe, "contentWindow", { value: { postMessage: post } });
    const play = () =>
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "https://www.youtube.com",
          source: iframe.contentWindow as Window,
          data: JSON.stringify({ event: "onStateChange", info: 1 }),
        })
      );
    const state = (info: number) =>
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "https://www.youtube.com",
          source: iframe.contentWindow as Window,
          data: JSON.stringify({ event: "onStateChange", info }),
        })
      );
    const unloads = () =>
      post.mock.calls.filter((c) => String(c[0]).includes("unloadModule")).map((c) => JSON.parse(c[0]).args[0]);
    play();
    play();
    expect(unloads()).toEqual(["captions", "cc"]);
    // A seek buffers and resumes, and YouTube brings captions back with it.
    state(3);
    play();
    expect(unloads()).toEqual(["captions", "cc", "captions", "cc"]);
  });
});
