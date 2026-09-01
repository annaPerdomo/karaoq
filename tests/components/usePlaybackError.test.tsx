import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";

import { usePlaybackError } from "../../components/player/usePlaybackError";

// One object for the whole file: the loader memoizes the API it resolved, as it
// does in a page.
let raiseError: ((e: { data: number }) => void) | null = null;
const destroy = vi.fn();
const FAKE_YT = {
  Player: function (_el: HTMLElement, opts: any) {
    raiseError = opts.events.onError;
    return { destroy };
  },
};

const fetchMock = vi.fn(async () => ({ ok: true }) as Response);

function Player({
  roomId,
  entryId,
  videoId,
  active,
}: {
  roomId?: string;
  entryId?: string;
  videoId?: string;
  active: boolean;
}) {
  const ref = React.useRef<HTMLIFrameElement>(null);
  const failed = usePlaybackError({ videoRef: ref, roomId, entryId, videoId, active });
  return (
    <>
      {active && entryId ? <iframe key={entryId} ref={ref} title="player" /> : null}
      <span data-testid="notice">{failed ? "failed" : "playing"}</span>
    </>
  );
}

function noticeText(): string {
  return screen.getByTestId("notice").textContent ?? "";
}

/** The player attaches from an effect that resolves a promise first. */
async function attach() {
  await waitFor(() => expect(raiseError).not.toBeNull());
}

beforeEach(() => {
  raiseError = null;
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  (window as any).YT = FAKE_YT;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as any).YT;
});

describe("usePlaybackError", () => {
  it("flags the song and reports the video once when embedding is disabled", async () => {
    render(<Player roomId="ABCD" entryId="entry-1" videoId="dQw4w9WgXcQ" active />);
    await attach();

    act(() => {
      raiseError!({ data: 150 });
      raiseError!({ data: 150 });
    });

    expect(noticeText()).toBe("failed");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/queue/unplayable");
    expect(JSON.parse(String(init.body))).toEqual({
      roomId: "ABCD",
      videoId: "dQw4w9WgXcQ",
      code: 150,
    });
  });

  it("shows the notice but files no report with no room to name", async () => {
    render(<Player roomId={undefined} entryId="entry-1" videoId="dQw4w9WgXcQ" active />);
    await attach();

    act(() => {
      raiseError!({ data: 150 });
    });

    expect(noticeText()).toBe("failed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores errors that say nothing about the video", async () => {
    render(<Player roomId="ABCD" entryId="entry-1" videoId="dQw4w9WgXcQ" active />);
    await attach();

    act(() => {
      raiseError!({ data: 5 }); // an HTML5 player fault
    });

    expect(noticeText()).toBe("playing");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("watches the next entry even when it holds the same video", async () => {
    const { rerender } = render(
      <Player roomId="ABCD" entryId="entry-1" videoId="dQw4w9WgXcQ" active />
    );
    await attach();

    act(() => {
      raiseError!({ data: 101 });
    });
    expect(noticeText()).toBe("failed");

    raiseError = null;
    rerender(<Player roomId="ABCD" entryId="entry-2" videoId="dQw4w9WgXcQ" active />);
    await attach();

    expect(destroy).toHaveBeenCalledOnce();
    expect(noticeText()).toBe("playing");

    act(() => {
      raiseError!({ data: 101 });
    });
    expect(noticeText()).toBe("failed");
  });

  it("drops the notice when this screen stops showing the video", async () => {
    const { rerender } = render(
      <Player roomId="ABCD" entryId="entry-1" videoId="dQw4w9WgXcQ" active />
    );
    await attach();

    act(() => {
      raiseError!({ data: 100 });
    });
    expect(noticeText()).toBe("failed");

    rerender(<Player roomId="ABCD" entryId="entry-1" videoId="dQw4w9WgXcQ" active={false} />);

    expect(noticeText()).toBe("playing");
  });

  it("attaches nothing while the player isn't the one showing the video", async () => {
    render(<Player roomId="ABCD" entryId="entry-1" videoId="dQw4w9WgXcQ" active={false} />);

    await Promise.resolve();
    expect(raiseError).toBeNull();
  });
});
