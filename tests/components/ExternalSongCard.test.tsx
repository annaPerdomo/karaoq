import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ExternalSongCard from "../../components/player/ExternalSongCard";
import { en } from "../../lib/i18n/messages";

const base = { singer: "Ana", title: "Dancing Queen", videoId: "dQw4w9WgXcQ" };

describe("ExternalSongCard display", () => {
  it.each([[true], [false]])("shows the stage tag, singer, title and line (playing %s)", (playing) => {
    render(<ExternalSongCard variant="display" playing={playing} {...base} />);
    expect(screen.getByText(en["display.tag.onStage"])).toBeInTheDocument();
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("Dancing Queen")).toBeInTheDocument();
    expect(screen.getByText(en["external.display.line"])).toBeInTheDocument();
  });
});

describe("ExternalSongCard host", () => {
  it("offers Open before playing and Open again while playing, as a safe new-tab link", () => {
    const { rerender } = render(<ExternalSongCard variant="host" playing={false} {...base} />);
    let link = screen.getByText(en["external.host.open"]).closest("a")!;
    expect(link.getAttribute("href")).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(screen.getByText(en["external.host.line"])).toBeInTheDocument();

    rerender(<ExternalSongCard variant="host" playing {...base} />);
    link = screen.getByText(en["external.host.reopen"]).closest("a")!;
    expect(link).toBeInTheDocument();
  });

  it("calls onOpen on click", () => {
    const onOpen = vi.fn();
    render(<ExternalSongCard variant="host" playing={false} onOpen={onOpen} {...base} />);
    fireEvent.click(screen.getByText(en["external.host.open"]));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
