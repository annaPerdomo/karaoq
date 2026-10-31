import { describe, it, expect, vi, afterEach } from "vitest";
import * as React from "react";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";

const broadcastOriginalOffsetMock = vi.fn();
vi.mock("../../app/queue/roomChannel", () => ({
  broadcastOriginalOffset: (...args: unknown[]) => broadcastOriginalOffsetMock(...args),
  onPlayhead: () => () => {},
}));

import { MusicVideoCard, musicVideoCardVisible } from "../../components/host/MusicVideoCard";
import { QueueEntry } from "../../pages/api/types";

const ENTRY: QueueEntry = { id: "e1", userName: "Ann", songTitle: "Song One", videoId: "v1" };
const ENTRY_2: QueueEntry = { id: "e2", userName: "Bea", songTitle: "Song Two", videoId: "v2" };

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

const sliderValue = () => (screen.getByLabelText("Timing") as HTMLInputElement).value;
function slideTo(value: string) {
  const bar = screen.getByLabelText("Timing");
  fireEvent.input(bar, { target: { value } });
  fireEvent.change(bar);
}
const NOT_PLAYING = { isPlaying: false, playStartedAt: null, playPausedAt: null };

describe("musicVideoCardVisible", () => {
  const now = Date.now();

  it("is hidden for co-hosts", () => {
    expect(musicVideoCardVisible(true, new Date(now).toISOString(), ENTRY)).toBe(false);
  });

  it("is hidden with no current song", () => {
    expect(musicVideoCardVisible(false, new Date(now).toISOString(), undefined)).toBe(false);
  });

  it("is hidden with no musicVideoAt at all", () => {
    expect(musicVideoCardVisible(false, null, ENTRY)).toBe(false);
  });

  it("is hidden once musicVideoAt is stale", () => {
    const stale = new Date(now - 13 * 60 * 1000).toISOString();
    expect(musicVideoCardVisible(false, stale, ENTRY)).toBe(false);
  });

  it("is visible for a recent musicVideoAt on the host", () => {
    const recent = new Date(now - 5 * 60 * 1000).toISOString();
    expect(musicVideoCardVisible(false, recent, ENTRY)).toBe(true);
  });
});

describe("MusicVideoCard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    broadcastOriginalOffsetMock.mockClear();
  });

  it("shows the picked candidate's title and lists candidates on Swap", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          status: "ok",
          videoIds: ["v1"],
          picked: null,
          candidates: [
            { videoId: "v1", title: "Right Video" },
            { videoId: "v2", title: "Wrong Video" },
          ],
        })
      )
    );

    render(<MusicVideoCard playback={NOT_PLAYING} joinCode="ROOM1" activeEntry={ENTRY} />);

    await waitFor(() => expect(screen.getByText("Right Video")).toBeTruthy());

    fireEvent.click(screen.getByText("Swap"));
    expect(screen.getByText("Wrong Video")).toBeTruthy();
  });

  it("shows the none message when no candidates were found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ status: "none", videoIds: [], picked: null, candidates: [] }))
    );

    render(<MusicVideoCard playback={NOT_PLAYING} joinCode="ROOM1" activeEntry={ENTRY} />);

    await waitFor(() => expect(screen.getByText("No match found. Paste a link instead.")).toBeTruthy());
  });

  it("picking a candidate POSTs and shows it as current", async () => {
    const posts: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          posts.push(JSON.parse(String(init.body)));
          return jsonResponse({ ok: true });
        }
        return jsonResponse({
          status: "ok",
          videoIds: ["v1"],
          picked: null,
          candidates: [
            { videoId: "v1", title: "Right Video" },
            { videoId: "v2", title: "Wrong Video" },
          ],
        });
      })
    );

    render(<MusicVideoCard playback={NOT_PLAYING} joinCode="ROOM1" activeEntry={ENTRY} />);
    await waitFor(() => expect(screen.getByText("Right Video")).toBeTruthy());

    fireEvent.click(screen.getByText("Swap"));
    fireEvent.click(screen.getByText("Wrong Video"));

    expect(screen.getByText("Wrong Video")).toBeTruthy();
    expect(posts).toEqual([{ entryId: "e1", videoId: "v2", source: "candidate" }]);
  });

  it("a bad pasted link shows the error instead of posting", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return jsonResponse({ ok: true });
      return jsonResponse({ status: "none", videoIds: [], picked: null, candidates: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<MusicVideoCard playback={NOT_PLAYING} joinCode="ROOM1" activeEntry={ENTRY} />);
    await waitFor(() => expect(screen.getByText("No match found. Paste a link instead.")).toBeTruthy());

    fireEvent.click(screen.getByText("Swap"));
    const input = screen.getByPlaceholderText("Search or paste a link...");
    fireEvent.change(input, { target: { value: "https://example.com/watch?v=x" } });
    fireEvent.click(screen.getByText("Search"));

    expect(screen.getByText("That isn't a YouTube video link")).toBeTruthy();
    expect(fetchMock.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === "POST")).toBe(
      false
    );
  });

  it("asks the server as the host, not the screen", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ status: "none", videoIds: [], picked: null, candidates: [] }));
    vi.stubGlobal("fetch", fetchMock);

    render(<MusicVideoCard playback={NOT_PLAYING} joinCode="ROOM1" activeEntry={ENTRY} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toMatch(/from=host/);
  });

  it("shows the skeleton on pending and retries until it resolves", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      return calls === 1
        ? jsonResponse({ status: "pending", videoIds: [], picked: null, candidates: [] })
        : jsonResponse({
            status: "ok",
            videoIds: ["v1"],
            picked: null,
            candidates: [{ videoId: "v1", title: "Right Video" }],
          });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<MusicVideoCard playback={NOT_PLAYING} joinCode="ROOM1" activeEntry={ENTRY} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(container.querySelector('[class*="skeleton"]')).toBeTruthy();
    expect(calls).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(calls).toBe(2);
    expect(screen.getByText("Right Video")).toBeTruthy();

    vi.useRealTimers();
  });

  it("treats a 404 as not-yet, not as no match: the server lags the host's advance", async () => {
    vi.useFakeTimers();
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        return calls === 1
          ? ({ ok: false, status: 404, json: async () => ({ code: 404 }) } as Response)
          : jsonResponse({
              status: "ok",
              videoIds: ["v1"],
              picked: null,
              candidates: [{ videoId: "v1", title: "Right Video" }],
            });
      })
    );

    const { container } = render(<MusicVideoCard playback={NOT_PLAYING} joinCode="ROOM1" activeEntry={ENTRY} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.queryByText("No match found. Paste a link instead.")).toBeNull();
    expect(container.querySelector('[class*="skeleton"]')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByText("Right Video")).toBeTruthy();

    vi.useRealTimers();
  });

  it("rolls back and shows an inline error when a pick fails", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return { ok: false, status: 500, json: async () => ({}) } as Response;
      return jsonResponse({
        status: "ok",
        videoIds: ["v1"],
        picked: null,
        candidates: [
          { videoId: "v1", title: "Right Video" },
          { videoId: "v2", title: "Wrong Video" },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<MusicVideoCard playback={NOT_PLAYING} joinCode="ROOM1" activeEntry={ENTRY} />);
    await waitFor(() => expect(screen.getByText("Right Video")).toBeTruthy());

    fireEvent.click(screen.getByText("Swap"));
    fireEvent.click(screen.getByText("Wrong Video"));

    await waitFor(() =>
      expect(screen.getByText("Couldn't swap that video. Try again.")).toBeTruthy()
    );
    expect(screen.getByText("Right Video")).toBeTruthy();
  });

  it("labels a pasted-link pick as a pasted video when it has no candidate title", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return jsonResponse({ ok: true });
      return jsonResponse({ status: "none", videoIds: [], picked: null, candidates: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<MusicVideoCard playback={NOT_PLAYING} joinCode="ROOM1" activeEntry={ENTRY} />);
    await waitFor(() => expect(screen.getByText("No match found. Paste a link instead.")).toBeTruthy());

    fireEvent.click(screen.getByText("Swap"));
    const input = screen.getByPlaceholderText("Search or paste a link...");
    fireEvent.change(input, { target: { value: "https://youtu.be/dQw4w9WgXcQ" } });
    fireEvent.click(screen.getByText("Search"));

    expect(screen.getByText("Pasted video")).toBeTruthy();
  });

  it("ignores a GET response that resolves after a local pick", async () => {
    let releaseGet!: (body: unknown) => void;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return jsonResponse({ ok: true });
      return new Promise<Response>((resolve) => {
        releaseGet = (body) => resolve(jsonResponse(body));
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<MusicVideoCard playback={NOT_PLAYING} joinCode="ROOM1" activeEntry={ENTRY} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.click(screen.getByText("Swap"));
    const input = screen.getByPlaceholderText("Search or paste a link...");
    fireEvent.change(input, { target: { value: "https://youtu.be/dQw4w9WgXcQ" } });
    fireEvent.click(screen.getByText("Search"));
    expect(screen.getByText("Pasted video")).toBeTruthy();

    await act(async () => {
      releaseGet({
        status: "ok",
        videoIds: ["v9"],
        picked: null,
        candidates: [{ videoId: "v9", title: "Stale Candidate" }],
      });
      await Promise.resolve();
    });

    expect(screen.getByText("Pasted video")).toBeTruthy();
    expect(screen.queryByText("Stale Candidate")).toBeNull();
  });

  it("shows the timing row once a video is resolved, starting from the entry's saved offset", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ status: "ok", videoIds: ["v1"], picked: null, candidates: [{ videoId: "v1", title: "Right Video" }] })
      )
    );
    render(<MusicVideoCard playback={NOT_PLAYING} joinCode="ROOM1" activeEntry={{ ...ENTRY, originalOffsetSeconds: 1.5 }} />);
    await waitFor(() => expect(sliderValue()).toBe("1.5"));
    expect(screen.getByText("Reset timing")).toBeTruthy();
  });

  it("taps update the readout immediately and post once after a burst of taps", async () => {
    vi.useFakeTimers();
    const posts: unknown[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)));
        return jsonResponse({ ok: true });
      }
      return jsonResponse({ status: "ok", videoIds: ["v1"], picked: null, candidates: [{ videoId: "v1", title: "Right Video" }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<MusicVideoCard playback={NOT_PLAYING} joinCode="ROOM1" activeEntry={ENTRY} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("Right Video")).toBeTruthy();

    slideTo("0.5");
    slideTo("1");
    slideTo("1.5");
    expect(sliderValue()).toBe("1.5");
    expect(posts).toEqual([]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(posts).toEqual([{ entryId: "e1", offsetSeconds: 1.5 }]);

    vi.useRealTimers();
  });

  it("restores the last saved offset and shows the error when the POST fails", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return { ok: false, status: 500, json: async () => ({}) } as Response;
      return jsonResponse({ status: "ok", videoIds: ["v1"], picked: null, candidates: [{ videoId: "v1", title: "Right Video" }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<MusicVideoCard playback={NOT_PLAYING} joinCode="ROOM1" activeEntry={ENTRY} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    slideTo("0.5");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(screen.getByText("Couldn't save the timing. Try again.")).toBeTruthy();
    expect(sliderValue()).toBe("0");
    expect(broadcastOriginalOffsetMock).toHaveBeenLastCalledWith("ROOM1", { entryId: "e1", offsetSeconds: 0 });

    vi.useRealTimers();
  });

  it("a failed pick restores the previous offset and re-broadcasts it to the screen", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return { ok: false, status: 500, json: async () => ({}) } as Response;
      return jsonResponse({
        status: "ok",
        videoIds: ["v1"],
        picked: null,
        candidates: [
          { videoId: "v1", title: "Right Video" },
          { videoId: "v2", title: "Wrong Video" },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<MusicVideoCard playback={NOT_PLAYING} joinCode="ROOM1" activeEntry={{ ...ENTRY, originalOffsetSeconds: 2 }} />);
    await waitFor(() => expect(sliderValue()).toBe("2"));
    broadcastOriginalOffsetMock.mockClear();

    fireEvent.click(screen.getByText("Swap"));
    fireEvent.click(screen.getByText("Wrong Video"));
    expect(broadcastOriginalOffsetMock).toHaveBeenLastCalledWith("ROOM1", { entryId: "e1", offsetSeconds: 0 });

    await waitFor(() => expect(sliderValue()).toBe("2"));
    expect(broadcastOriginalOffsetMock).toHaveBeenLastCalledWith("ROOM1", { entryId: "e1", offsetSeconds: 2 });
  });

  it("a stale offset POST failure does not roll back a newer tap's value", async () => {
    vi.useFakeTimers();
    const resolvers: Array<(ok: boolean) => void> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return new Promise<Response>((resolve) => {
          resolvers.push((ok) =>
            resolve(
              ok
                ? ({ ok: true, status: 200, json: async () => ({ ok: true }) } as Response)
                : ({ ok: false, status: 500, json: async () => ({}) } as Response)
            )
          );
        });
      }
      return jsonResponse({ status: "ok", videoIds: ["v1"], picked: null, candidates: [{ videoId: "v1", title: "Right Video" }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<MusicVideoCard playback={NOT_PLAYING} joinCode="ROOM1" activeEntry={ENTRY} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    slideTo("0.5"); // slide to +0.5s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600); // fires POST #1, left pending
    });

    slideTo("1"); // slide to +1s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600); // fires POST #2, left pending
    });

    await act(async () => {
      resolvers[0](false);
      await Promise.resolve();
    });
    expect(sliderValue()).toBe("1");
    expect(screen.queryByText("Couldn't save the timing. Try again.")).toBeNull();

    await act(async () => {
      resolvers[1](true);
      await Promise.resolve();
    });
    expect(sliderValue()).toBe("1");

    vi.useRealTimers();
  });

  it("an entry change while an offset POST is in flight leaves the new entry's readout alone on success", async () => {
    vi.useFakeTimers();
    let resolvePost: ((r: Response) => void) | null = null;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return new Promise<Response>((resolve) => {
          resolvePost = resolve;
        });
      }
      return jsonResponse({ status: "ok", videoIds: ["v1"], picked: null, candidates: [{ videoId: "v1", title: "Right Video" }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(<MusicVideoCard playback={NOT_PLAYING} joinCode="ROOM1" activeEntry={ENTRY} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    slideTo("0.5");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600); // POST now in flight
    });

    rerender(<MusicVideoCard playback={NOT_PLAYING} joinCode="ROOM1" activeEntry={{ ...ENTRY_2, originalOffsetSeconds: 3 }} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(sliderValue()).toBe("3");

    await act(async () => {
      resolvePost?.({ ok: true, status: 200, json: async () => ({ ok: true }) } as Response);
      await Promise.resolve();
    });
    expect(sliderValue()).toBe("3");

    vi.useRealTimers();
  });

  it("an entry change while an offset POST is in flight leaves the new entry's readout alone on failure", async () => {
    vi.useFakeTimers();
    let resolvePost: ((r: Response) => void) | null = null;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return new Promise<Response>((resolve) => {
          resolvePost = resolve;
        });
      }
      return jsonResponse({ status: "ok", videoIds: ["v1"], picked: null, candidates: [{ videoId: "v1", title: "Right Video" }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(<MusicVideoCard playback={NOT_PLAYING} joinCode="ROOM1" activeEntry={ENTRY} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    slideTo("0.5");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600); // POST now in flight
    });

    rerender(<MusicVideoCard playback={NOT_PLAYING} joinCode="ROOM1" activeEntry={{ ...ENTRY_2, originalOffsetSeconds: 3 }} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(sliderValue()).toBe("3");

    await act(async () => {
      resolvePost?.({ ok: false, status: 500, json: async () => ({}) } as Response);
      await Promise.resolve();
    });
    expect(sliderValue()).toBe("3");
    expect(screen.queryByText("Couldn't save the timing. Try again.")).toBeNull();

    vi.useRealTimers();
  });

  it("picking a candidate resets the timing nudge", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return jsonResponse({ ok: true });
      return jsonResponse({
        status: "ok",
        videoIds: ["v1"],
        picked: null,
        candidates: [
          { videoId: "v1", title: "Right Video" },
          { videoId: "v2", title: "Wrong Video" },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<MusicVideoCard playback={NOT_PLAYING} joinCode="ROOM1" activeEntry={{ ...ENTRY, originalOffsetSeconds: 2 }} />);
    await waitFor(() => expect(sliderValue()).toBe("2"));

    fireEvent.click(screen.getByText("Swap"));
    fireEvent.click(screen.getByText("Wrong Video"));

    expect(sliderValue()).toBe("0");
    expect(screen.queryByText("Reset timing")).toBeNull();
  });

  it("scrubs the music video's own timeline: dragging sets position minus the karaoke's", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const posts: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          posts.push(JSON.parse(String(init.body)));
          return jsonResponse({ ok: true });
        }
        return jsonResponse({
          status: "ok",
          videoIds: ["v1"],
          picked: null,
          candidates: [{ videoId: "v1", title: "Right Video", durationSeconds: 225 }],
        });
      })
    );
    const playing = {
      isPlaying: true,
      playStartedAt: new Date(Date.now() - 30_000).toISOString(),
      playPausedAt: null,
    };
    render(<MusicVideoCard playback={playing} joinCode="ROOM1" activeEntry={ENTRY} />);
    await waitFor(() => expect(screen.getByText("Right Video")).toBeTruthy());

    expect(screen.getByText(/\/ 3:45/)).toBeTruthy();
    const bar = screen.getByLabelText("Timing") as HTMLInputElement;
    expect(Number(bar.value)).toBeGreaterThanOrEqual(29);

    slideTo("40");
    await vi.advanceTimersByTimeAsync(1000);
    const offset = (posts[0] as { offsetSeconds: number }).offsetSeconds;
    expect(offset).toBeGreaterThanOrEqual(9);
    expect(offset).toBeLessThanOrEqual(11);
    vi.useRealTimers();
  });

  it("previews the music video with a still, never a second player", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          status: "ok",
          videoIds: ["v1"],
          picked: null,
          candidates: [{ videoId: "v1", title: "Right Video", durationSeconds: 200 }],
        })
      )
    );
    const { container } = render(<MusicVideoCard playback={NOT_PLAYING} joinCode="ROOM1" activeEntry={ENTRY} />);
    await waitFor(() => expect(screen.getByText("Right Video")).toBeTruthy());
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector('[class*="preview"] img[src*="/vi/v1/"]')).toBeTruthy();

    fireEvent.pointerDown(screen.getByLabelText("Timing"));
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("Swap has a search box: results can be picked and keep their title", async () => {
    const posts: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          posts.push(JSON.parse(String(init.body)));
          return jsonResponse({ ok: true });
        }
        if (url.includes("/original-video-search")) {
          expect(url).toContain("q=bad%20romance%20live");
          return jsonResponse({
            status: "ok",
            candidates: [{ videoId: "live1234567", title: "Bad Romance (Live)", durationSeconds: 300 }],
          });
        }
        return jsonResponse({
          status: "ok",
          videoIds: ["v1"],
          picked: null,
          candidates: [{ videoId: "v1", title: "Right Video" }],
        });
      })
    );
    render(<MusicVideoCard playback={NOT_PLAYING} joinCode="ROOM1" activeEntry={ENTRY} />);
    await waitFor(() => expect(screen.getByText("Right Video")).toBeTruthy());

    fireEvent.click(screen.getByText("Swap"));
    fireEvent.change(screen.getByPlaceholderText("Search or paste a link..."), {
      target: { value: "bad romance live" },
    });
    fireEvent.click(screen.getByText("Search"));
    await waitFor(() => expect(screen.getByText("Bad Romance (Live)")).toBeTruthy());

    fireEvent.click(screen.getByText("Bad Romance (Live)"));
    await waitFor(() => expect(posts).toEqual([{ entryId: "e1", videoId: "live1234567", source: "search" }]));
    expect(screen.getByText("Bad Romance (Live)")).toBeTruthy();
  });

  it("keeps moving with the video after a drag is released", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) =>
        init?.method === "POST"
          ? jsonResponse({ ok: true })
          : jsonResponse({
              status: "ok",
              videoIds: ["v1"],
              picked: null,
              candidates: [{ videoId: "v1", title: "Right Video", durationSeconds: 225 }],
            })
      )
    );
    const playing = {
      isPlaying: true,
      playStartedAt: new Date(Date.now() - 30_000).toISOString(),
      playPausedAt: null,
    };
    render(<MusicVideoCard playback={playing} joinCode="ROOM1" activeEntry={ENTRY} />);
    await waitFor(() => expect(screen.getByText("Right Video")).toBeTruthy());

    slideTo("60");
    const dropped = Number(sliderValue());
    await vi.advanceTimersByTimeAsync(3000);
    expect(Number(sliderValue())).toBeGreaterThanOrEqual(dropped + 2);
    vi.useRealTimers();
  });

  it("skips the music video 5 seconds back or forward, never before its start", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const posts: { offsetSeconds: number }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          posts.push(JSON.parse(String(init.body)));
          return jsonResponse({ ok: true });
        }
        return jsonResponse({
          status: "ok",
          videoIds: ["v1"],
          picked: null,
          candidates: [{ videoId: "v1", title: "Right Video", durationSeconds: 225 }],
        });
      })
    );
    render(<MusicVideoCard playback={NOT_PLAYING} joinCode="ROOM1" activeEntry={ENTRY} />);
    await waitFor(() => expect(screen.getByText("Right Video")).toBeTruthy());

    fireEvent.click(screen.getByLabelText("Forward 5 seconds"));
    fireEvent.click(screen.getByLabelText("Forward 5 seconds"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(posts.at(-1)!.offsetSeconds).toBe(10);
    expect(sliderValue()).toBe("10");

    fireEvent.click(screen.getByLabelText("Back 5 seconds"));
    fireEvent.click(screen.getByLabelText("Back 5 seconds"));
    fireEvent.click(screen.getByLabelText("Back 5 seconds"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(posts.at(-1)!.offsetSeconds).toBe(0);
    vi.useRealTimers();
  });
});
