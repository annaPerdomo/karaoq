import { describe, it, expect, vi, afterEach } from "vitest";
import * as React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

import { KaraokeSwapSheet } from "../../components/host/KaraokeSwapSheet";
import { QueueEntry } from "../../pages/api/types";

const ENTRY: QueueEntry = { id: "e1", userName: "Ann", songTitle: "Bohemian Rhapsody", videoId: "bad00000000" };

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

function renderCard(fetchImpl: (url: string) => Promise<Response>, live = true) {
  const fetchMock = vi.fn((url: string) => fetchImpl(url));
  vi.stubGlobal("fetch", fetchMock);
  const onSwap = vi.fn();
  const onClose = vi.fn();
  render(<KaraokeSwapSheet joinCode="ROOM1" entry={ENTRY} live={live} roomPlaying={live} onClose={onClose} onSwap={onSwap} />);
  return { fetchMock, onSwap, onClose };
}

const linkInput = () => screen.getByRole("textbox") as HTMLInputElement;
function submitBox(value: string) {
  fireEvent.change(linkInput(), { target: { value } });
  fireEvent.keyDown(linkInput(), { key: "Enter" });
}

describe("KaraokeSwapSheet", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("logs the opening and offers the corpus's other cuts", async () => {
    const cut = { videoId: "good0000000", title: "Bohemian Rhapsody - Sing King", durationSeconds: 360 };
    const { fetchMock, onSwap, onClose } = renderCard(async (url) =>
      url.startsWith("/api/queue/") ? jsonResponse({ candidates: [cut] }) : jsonResponse({ ok: true })
    );

    expect(screen.getByText("Swapping restarts the song from the top.")).toBeTruthy();
    expect(screen.getByText("Ann · Bohemian Rhapsody")).toBeTruthy();
    expect(linkInput().value).toBe("");
    const opened = fetchMock.mock.calls.find(([u]) => String(u) === "/api/analytics/screen-event");
    expect(JSON.parse((opened![1] as RequestInit).body as string)).toEqual({
      roomId: "ROOM1",
      type: "karaoke_swap_opened",
      data: { live: true },
    });

    fireEvent.click(await screen.findByText(cut.title));
    fireEvent.click(screen.getByText("Use this video"));
    expect(onSwap).toHaveBeenCalledWith("e1", cut, "candidate");
    expect(onClose).toHaveBeenCalled();
  });

  it("previews a version muted while a song plays, unmutes on request, and goes back without swapping", async () => {
    const cut = { videoId: "good0000000", title: "Sing King cut" };
    const { onSwap } = renderCard(async () => jsonResponse({ candidates: [cut] }));
    fireEvent.click(await screen.findByLabelText("Preview this video"));

    const frame = document.querySelector("iframe") as HTMLIFrameElement;
    expect(frame.src).toContain("/embed/good0000000?autoplay=1");
    expect(frame.src).toContain("mute=1");
    const post = vi.fn();
    Object.defineProperty(frame, "contentWindow", { value: { postMessage: post } });
    fireEvent.click(screen.getByText(/Unmute/));
    expect(JSON.parse(post.mock.calls[0][0])).toMatchObject({ event: "command", func: "unMute" });
    expect(screen.getByText(/Mute/)).toBeTruthy();
    expect(document.querySelector("iframe")).toBe(frame);

    fireEvent.click(screen.getByText("Back"));
    expect(screen.getByText(cut.title)).toBeTruthy();
    expect(onSwap).not.toHaveBeenCalled();
  });

  it("previews with sound when nothing is playing", async () => {
    renderCard(async () => jsonResponse({ candidates: [{ videoId: "good0000000", title: "Cut" }] }), false);
    fireEvent.click(await screen.findByLabelText("Preview this video"));
    expect((document.querySelector("iframe") as HTMLIFrameElement).src).not.toContain("mute=1");
  });

  it("closes on Escape without swapping", () => {
    const { onSwap, onClose } = renderCard(async () => jsonResponse({ candidates: [] }), false);
    expect(screen.queryByText("Swapping restarts the song from the top.")).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
    expect(onSwap).not.toHaveBeenCalled();
  });

  it("looks a pasted link up before swapping to it", async () => {
    const { onSwap, fetchMock } = renderCard(async (url) =>
      url.startsWith("/api/video-lookup")
        ? jsonResponse([{ videoId: "pasted00000", title: "Pasted cut", thumbnailUrl: "t", durationSeconds: 300 }])
        : jsonResponse({ candidates: [] })
    );
    submitBox("https://youtu.be/pasted00000");
    fireEvent.click(screen.getByText("Use this video"));

    await waitFor(() =>
      expect(onSwap).toHaveBeenCalledWith(
        "e1",
        { videoId: "pasted00000", title: "Pasted cut", durationSeconds: 300 },
        "link"
      )
    );
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("roomId=ROOM1"))).toBe(true);
  });

  it("refuses a link YouTube won't embed", async () => {
    const { onSwap } = renderCard(async (url) =>
      url.startsWith("/api/video-lookup")
        ? jsonResponse({ reason: "not_embeddable" }, false, 422)
        : jsonResponse({ candidates: [] })
    );
    submitBox("https://youtu.be/pasted00000");
    fireEvent.click(screen.getByText("Use this video"));

    expect(await screen.findByText("That video can't be played here. Pick another.")).toBeTruthy();
    expect(onSwap).not.toHaveBeenCalled();
  });

  it("searches karaoke cuts with the song search", async () => {
    const { fetchMock } = renderCard(async (url) =>
      url.startsWith("/api/search")
        ? jsonResponse([{ videoId: "found000000", title: "Found cut", thumbnailUrl: "t" }])
        : jsonResponse({ candidates: [] })
    );
    submitBox("queen bohemian");

    expect(await screen.findByText("Found cut")).toBeTruthy();
    const searchUrl = fetchMock.mock.calls.map(([u]) => String(u)).find((u) => u.startsWith("/api/search"))!;
    expect(new URLSearchParams(searchUrl.split("?")[1]).get("q")).toBe("queen bohemian karaoke");
  });
});
