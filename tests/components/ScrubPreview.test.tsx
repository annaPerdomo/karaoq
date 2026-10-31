import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { render, act } from "@testing-library/react";

import { ScrubPreview } from "../../components/host/ScrubPreview";

function ytMessage(source: unknown, info: number) {
  return new MessageEvent("message", {
    origin: "https://www.youtube.com",
    source: source as Window,
    data: JSON.stringify({ event: "onStateChange", info }),
  });
}

function mount(seconds: number) {
  const utils = render(<ScrubPreview videoId="dQw4w9WgXcQ" seconds={seconds} />);
  const iframe = utils.container.querySelector("iframe")!;
  const post = vi.fn();
  Object.defineProperty(iframe, "contentWindow", { value: { postMessage: post } });
  const commands = () => post.mock.calls.map((c) => JSON.parse(c[0])).filter((m) => m.event === "command");
  return { ...utils, iframe, post, commands };
}

describe("ScrubPreview", () => {
  it("loads muted with the start frozen at mount", () => {
    const { iframe, rerender } = mount(42.7);
    const src = iframe.src;
    expect(src).toContain("mute=1");
    expect(src).toContain("start=42");
    rerender(<ScrubPreview videoId="dQw4w9WgXcQ" seconds={90} />);
    expect(iframe.src).toBe(src);
  });

  it("freezes on its first play and seeks to the thumb", () => {
    const { iframe, commands } = mount(42);
    act(() => {
      window.dispatchEvent(ytMessage(iframe.contentWindow, 1));
    });
    expect(commands().map((c) => c.func)).toEqual(["pauseVideo", "seekTo"]);
    expect(commands()[1].args[0]).toBe(42);
  });

  it("ignores another player's messages", () => {
    const { commands } = mount(42);
    act(() => {
      window.dispatchEvent(ytMessage({}, 1));
    });
    expect(commands()).toEqual([]);
  });
});
