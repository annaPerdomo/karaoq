import { describe, it, expect, vi, afterEach } from "vitest";
import * as React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

import { KaraokeVideoCard } from "../../components/host/KaraokeVideoCard";
import { QueueEntry } from "../../pages/api/types";

const ENTRY: QueueEntry = { id: "e1", userName: "Ann", songTitle: "Bohemian Rhapsody", videoId: "bad00000000" };

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

function renderCard(fetchImpl: (url: string) => Promise<Response>, live = true) {
  const fetchMock = vi.fn((url: string) => fetchImpl(url));
  vi.stubGlobal("fetch", fetchMock);
  const onSwap = vi.fn();
  render(<KaraokeVideoCard joinCode="ROOM1" activeEntry={ENTRY} live={live} onSwap={onSwap} />);
  return { fetchMock, onSwap };
}

const linkInput = () => screen.getByRole("textbox") as HTMLInputElement;
function submitBox(value: string) {
  fireEvent.change(linkInput(), { target: { value } });
  fireEvent.keyDown(linkInput(), { key: "Enter" });
}

describe("KaraokeVideoCard", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("doesn't ask for alternatives until the host opens the panel", () => {
    const { fetchMock } = renderCard(async () => jsonResponse({ candidates: [] }));
    expect(screen.getByText("Bohemian Rhapsody")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("swaps to a corpus cut on tap, and warns that a live song restarts", async () => {
    const cut = { videoId: "good0000000", title: "Bohemian Rhapsody - Sing King", durationSeconds: 360 };
    const { onSwap } = renderCard(async () => jsonResponse({ candidates: [cut] }));
    fireEvent.click(screen.getByText("Swap"));

    expect(screen.getByText("Swapping restarts the song from the top.")).toBeTruthy();
    expect(linkInput().value).toBe("Bohemian Rhapsody");
    fireEvent.click(await screen.findByText(cut.title));
    expect(onSwap).toHaveBeenCalledWith("e1", cut, "candidate");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("looks a pasted link up before swapping to it", async () => {
    const { onSwap, fetchMock } = renderCard(async (url) =>
      url.startsWith("/api/video-lookup")
        ? jsonResponse([{ videoId: "pasted00000", title: "Pasted cut", thumbnailUrl: "t", durationSeconds: 300 }])
        : jsonResponse({ candidates: [] })
    );
    fireEvent.click(screen.getByText("Swap"));
    submitBox("https://youtu.be/pasted00000");

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
    fireEvent.click(screen.getByText("Swap"));
    submitBox("https://youtu.be/pasted00000");

    expect(await screen.findByText("That video can't be played here. Pick another.")).toBeTruthy();
    expect(onSwap).not.toHaveBeenCalled();
  });

  it("searches karaoke cuts with the song search", async () => {
    const { fetchMock } = renderCard(async (url) =>
      url.startsWith("/api/search")
        ? jsonResponse([{ videoId: "found000000", title: "Found cut", thumbnailUrl: "t" }])
        : jsonResponse({ candidates: [] })
    );
    fireEvent.click(screen.getByText("Swap"));
    submitBox("queen bohemian");

    expect(await screen.findByText("Found cut")).toBeTruthy();
    const searchUrl = fetchMock.mock.calls.map(([u]) => String(u)).find((u) => u.startsWith("/api/search"))!;
    expect(new URLSearchParams(searchUrl.split("?")[1]).get("q")).toBe("queen bohemian karaoke");
  });
});
