import { describe, it, expect } from "vitest";
import * as React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

import MusicVideoIdle from "../../components/musicvideo/MusicVideoIdle";

describe("MusicVideoIdle", () => {
  it("renders no waiting text while a video is still resolving", () => {
    render(<MusicVideoIdle reason="waiting" thumbnailId={null} />);
    expect(screen.queryByText(/music video/i)).toBeNull();
  });

  it("shows the song title without the karaoke upload's extras", () => {
    render(
      <MusicVideoIdle
        reason="waiting"
        thumbnailId={null}
        songTitle="Bad Romance - Lady Gaga (Karaoke Songs With Lyrics - Original Key)"
      />
    );
    expect(screen.getByText(/Bad Romance/).textContent).not.toMatch(/Karaoke/);
  });

  it("puts the singer up front", () => {
    render(<MusicVideoIdle reason="waiting" thumbnailId={null} singerName="Ana" songTitle="Song One" />);
    expect(screen.getByText("Ana")).toBeTruthy();
    expect(screen.getByText("Up Next")).toBeTruthy();
  });

  it("shows the unavailable text only when there is no video", () => {
    render(<MusicVideoIdle reason="unavailable" thumbnailId={null} />);
    expect(screen.getByText("No music video for this one")).toBeTruthy();
  });

  it("renders no centred join QR — that lives in the corner now", () => {
    const { container } = render(<MusicVideoIdle reason="waiting" thumbnailId={null} />);
    expect(container.querySelector('[class*="qrBox"]')).toBeNull();
    expect(screen.queryByText("SCAN TO JOIN")).toBeNull();
  });

  it("renders a maxres thumbnail for a resolved video", () => {
    const { container } = render(<MusicVideoIdle reason="waiting" thumbnailId="abc12345678" />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("https://i.ytimg.com/vi/abc12345678/maxresdefault.jpg");
    expect(img.className).not.toMatch(/idleThumbCropped/);
  });

  it("falls back to hqdefault when the maxres image is YouTube's missing placeholder", () => {
    const { container } = render(<MusicVideoIdle reason="waiting" thumbnailId="abc12345678" />);
    const img = container.querySelector("img")!;
    Object.defineProperty(img, "naturalWidth", { value: 120, configurable: true });
    fireEvent.load(img);
    const fallback = container.querySelector("img")!;
    expect(fallback.getAttribute("src")).toBe("https://i.ytimg.com/vi/abc12345678/hqdefault.jpg");
  });

  it("falls back to hqdefault on a maxres load error", () => {
    const { container } = render(<MusicVideoIdle reason="waiting" thumbnailId="abc12345678" />);
    const img = container.querySelector("img")!;
    fireEvent.error(img);
    const fallback = container.querySelector("img")!;
    expect(fallback.getAttribute("src")).toBe("https://i.ytimg.com/vi/abc12345678/hqdefault.jpg");
  });

  it("crops the hqdefault fallback's letterboxing, unlike maxres", () => {
    const { container } = render(<MusicVideoIdle reason="waiting" thumbnailId="abc12345678" />);
    const img = container.querySelector("img")!;
    fireEvent.error(img);
    const fallback = container.querySelector("img")!;
    expect(fallback.getAttribute("src")).toBe("https://i.ytimg.com/vi/abc12345678/hqdefault.jpg");
    expect(fallback.className).toMatch(/idleThumbCropped/);
  });

  it("stays invisible until a real load validates it, then fades in", () => {
    const { container } = render(<MusicVideoIdle reason="waiting" thumbnailId="abc12345678" />);
    const img = container.querySelector("img")!;
    expect(img.className).not.toMatch(/idleThumbShown/);

    Object.defineProperty(img, "naturalWidth", { value: 640, configurable: true });
    fireEvent.load(img);

    const shown = container.querySelector("img")!;
    expect(shown.className).toMatch(/idleThumbShown/);
  });

  it("a new thumbnailId starts back at maxres, invisible again", () => {
    const { container, rerender } = render(
      <MusicVideoIdle reason="waiting" thumbnailId="abc12345678" />
    );
    const first = container.querySelector("img")!;
    Object.defineProperty(first, "naturalWidth", { value: 640, configurable: true });
    fireEvent.load(first);
    expect(container.querySelector("img")!.className).toMatch(/idleThumbShown/);

    rerender(<MusicVideoIdle reason="waiting" thumbnailId="def98765432" />);
    const next = container.querySelector("img")!;
    expect(next.getAttribute("src")).toBe("https://i.ytimg.com/vi/def98765432/maxresdefault.jpg");
    expect(next.className).not.toMatch(/idleThumbShown/);
  });
});
