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
  it("asks for no captions and unloads them once playback starts", () => {
    const { container } = render(<Player />);
    const iframe = container.querySelector("iframe")!;
    expect(iframe.src).toContain("cc_load_policy=0");
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
    play();
    play();
    const unloads = post.mock.calls.filter((c) => String(c[0]).includes("unloadModule"));
    expect(unloads.map((c) => JSON.parse(c[0]).args[0])).toEqual(["captions", "cc"]);
  });
});
