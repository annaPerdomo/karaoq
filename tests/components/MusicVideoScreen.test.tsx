import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { render, waitFor, act, screen } from "@testing-library/react";
import { DORMANT_AFTER_MS } from "../../lib/roomDormancy";

vi.mock("next/router", () => ({
  useRouter: () => ({ query: { joinCode: "room1" } }),
}));

import MusicVideoScreen from "../../components/MusicVideoScreen";
import { broadcastDisplayPause } from "../../app/queue/roomChannel";

// Mirrors tests/lib/roomChannel.test.ts's mock — real enough to round-trip
// broadcasts between a sender and this component's listeners.
class MockBroadcastChannel {
  name: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  static channels = new Map<string, MockBroadcastChannel[]>();
  constructor(name: string) {
    this.name = name;
    if (!MockBroadcastChannel.channels.has(name)) MockBroadcastChannel.channels.set(name, []);
    MockBroadcastChannel.channels.get(name)!.push(this);
  }
  postMessage(data: unknown) {
    const instances = MockBroadcastChannel.channels.get(this.name) || [];
    for (const instance of instances) {
      if (instance !== this && instance.onmessage) {
        instance.onmessage(new MessageEvent("message", { data }));
      }
    }
  }
  close() {}
}

const ROOM = {
  id: "ROOM1",
  queue: [
    { id: "e1", userName: "Ana", songTitle: "Song One", videoId: "v1" },
    { id: "e2", userName: "Bo", songTitle: "Song Two", videoId: "v2" },
  ],
  activeVideoIndex: 0,
  isPlaying: true,
  reactionsEnabled: true,
  playStartedAt: new Date().toISOString(),
  serverNow: Date.now(),
};

function fetchMockFor(room: typeof ROOM) {
  return vi.fn(async (url: string) => {
    if (typeof url === "string" && url.includes("/api/queue/") && url.includes("/original-video")) {
      return { ok: true, status: 200, json: async () => ({ status: "ok", videoIds: ["ov1"] }) } as Response;
    }
    return { ok: true, status: 200, json: async () => room } as Response;
  });
}

describe("MusicVideoScreen", () => {
  beforeEach(() => {
    vi.stubGlobal("BroadcastChannel", undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("never reads the room with the display heartbeat, and never calls display/video-ended routes", async () => {
    const fetchMock = fetchMockFor(ROOM);
    vi.stubGlobal("fetch", fetchMock);

    render(<MusicVideoScreen />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const calledUrls = fetchMock.mock.calls.map((c) => String(c[0]));
    for (const url of calledUrls) {
      expect(url).not.toMatch(/display=1/);
      expect(url).not.toMatch(/display-seen|display-paused|video-ended|\/play\b/);
    }
  });

  it("posts music_video_screen_opened once, and closed on pagehide with counts", async () => {
    const fetchMock = fetchMockFor(ROOM);
    const screenEventCalls: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (typeof url === "string" && url.includes("/api/analytics/screen-event")) {
          screenEventCalls.push(JSON.parse(String(init?.body)));
          return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
        }
        return fetchMock(url);
      })
    );

    render(<MusicVideoScreen />);

    await waitFor(() =>
      expect(screenEventCalls.some((c: any) => c.type === "music_video_screen_opened")).toBe(true)
    );
    expect(screenEventCalls.filter((c: any) => c.type === "music_video_screen_opened")).toHaveLength(1);

    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });

    await waitFor(() =>
      expect(screenEventCalls.some((c: any) => c.type === "music_video_screen_closed")).toBe(true)
    );
    const closed = screenEventCalls.find((c: any) => c.type === "music_video_screen_closed") as any;
    expect(closed.data).toEqual(
      expect.objectContaining({ songsShown: 0, songsUnavailable: 0 })
    );
  });

  it("backs off to the dormant poll interval for a quiet, not-playing room", async () => {
    // Fake timers from before mount: startVisiblePolling schedules its first
    // tick synchronously on mount, so real timers can never observe it later.
    vi.useFakeTimers();
    const dormantRoom = {
      ...ROOM,
      isPlaying: false,
      playStartedAt: undefined,
      lastActivity: new Date(Date.now() - DORMANT_AFTER_MS - 1000).toISOString(),
    };
    const fetchMock = fetchMockFor(dormantRoom as any);
    vi.stubGlobal("fetch", fetchMock);

    render(<MusicVideoScreen />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
    });
    const callsAfterLoad = fetchMock.mock.calls.length;
    expect(callsAfterLoad).toBeGreaterThan(0);

    // The poll effect schedules its very first tick on mount, before the
    // async initial load has set dormantRef — so that one tick still lands
    // at the normal interval. It's the one after that backs off.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    const callsAfterFirstPoll = fetchMock.mock.calls.length;
    expect(callsAfterFirstPoll).toBeGreaterThan(callsAfterLoad);

    // Short of the dormant interval: no further poll yet.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirstPoll);

    // Past the dormant interval: the next poll finally fires.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterFirstPoll);

    vi.useRealTimers();
  });

  it("stops polling and shows the error panel after repeated notFound, like Display", async () => {
    vi.useFakeTimers();
    let pollCount = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (typeof url !== "string" || !url.startsWith("/api/queue/")) {
        return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
      }
      if (url.includes("/original-video")) {
        return { ok: true, status: 200, json: async () => ({ status: "ok", videoIds: ["ov1"] }) } as Response;
      }
      pollCount += 1;
      if (pollCount === 1) return { ok: true, status: 200, json: async () => ROOM } as Response;
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<MusicVideoScreen />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(pollCount).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(screen.getByText("Room not found")).toBeInTheDocument();
    const countAtError = pollCount;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(pollCount).toBe(countAtError);

    vi.useRealTimers();
  });

  it("pauses the player immediately on a same-browser display-pause broadcast", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    MockBroadcastChannel.channels.clear();
    const fetchMock = fetchMockFor(ROOM);
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<MusicVideoScreen />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
    });

    const iframe = container.querySelector("iframe") as HTMLIFrameElement;
    expect(iframe).not.toBeNull();
    const postMessage = vi.spyOn(iframe.contentWindow as Window, "postMessage");
    postMessage.mockClear();

    act(() => {
      broadcastDisplayPause("ROOM1", true);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    const commands = postMessage.mock.calls
      .map(([data]) => { try { return JSON.parse(data as string); } catch { return null; } })
      .filter(Boolean);
    expect(commands.some((c) => c.func === "pauseVideo")).toBe(true);

    vi.useRealTimers();
  });

  it("shows the resolved video's thumbnail, not unavailable, between songs", async () => {
    vi.stubGlobal("fetch", fetchMockFor({ ...ROOM, isPlaying: false }));
    const { container } = render(<MusicVideoScreen />);
    await waitFor(() =>
      expect(container.querySelector('img[src*="i.ytimg.com/vi/ov1/maxresdefault.jpg"]')).toBeTruthy()
    );
    expect(screen.queryByText("No music video for this one")).toBeNull();
  });

  it("says unavailable only when the song has no original video", async () => {
    const room = ROOM;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("/original-video")
          ? ({ ok: true, status: 200, json: async () => ({ status: "none", videoIds: [] }) } as Response)
          : ({ ok: true, status: 200, json: async () => room } as Response)
      )
    );
    render(<MusicVideoScreen />);
    await waitFor(() => expect(screen.getByText("No music video for this one")).toBeTruthy());
  });

  it("takes the display's theme — it is a TV surface, like the main Display", async () => {
    vi.stubGlobal(
      "fetch",
      fetchMockFor({ ...ROOM, hostConfig: { theme: "neon" }, displayConfig: { theme: "minimal" } } as typeof ROOM)
    );
    const { container } = render(<MusicVideoScreen />);
    await waitFor(() => expect(container.querySelector("main")!.className).toMatch(/themeMinimal/));
  });

  it("applies the room's --logo-scale to the club logo", async () => {
    vi.stubGlobal("fetch", fetchMockFor({ ...ROOM, brand: { logo: "0123456789abcdef", logoScale: 1.5 } } as typeof ROOM));
    const { container } = render(<MusicVideoScreen />);
    await waitFor(() =>
      expect(container.querySelector("main")!.style.getPropertyValue("--logo-scale")).toBe("1.5")
    );
  });

  it("shows the join QR corner while a video is playing", async () => {
    vi.stubGlobal("fetch", fetchMockFor(ROOM));
    const { container } = render(<MusicVideoScreen />);
    await waitFor(() => expect(container.querySelector('[class*="qrCorner"]')).toBeTruthy());
  });

  it("also shows the QR corner when idle — the idle panel has no QR of its own anymore", async () => {
    vi.stubGlobal("fetch", fetchMockFor({ ...ROOM, isPlaying: false }));
    const { container } = render(<MusicVideoScreen />);
    await waitFor(() => expect(container.querySelector("img")).toBeTruthy());
    expect(container.querySelector('[class*="qrCorner"]')).toBeTruthy();
  });

  it("hides the QR corner when the room's display config hides the QR", async () => {
    vi.stubGlobal(
      "fetch",
      fetchMockFor({ ...ROOM, displayConfig: { qrSize: "hidden" } } as typeof ROOM)
    );
    const { container } = render(<MusicVideoScreen />);
    await waitFor(() => expect(container.querySelector("iframe")).toBeTruthy());
    expect(container.querySelector('[class*="qrCorner"]')).toBeNull();
  });

  it("sizes the QR corner from the room's Display qrPx, not a fixed small size", async () => {
    vi.stubGlobal(
      "fetch",
      fetchMockFor({ ...ROOM, displayConfig: { qrPx: 140 } } as typeof ROOM)
    );
    const { container } = render(<MusicVideoScreen />);
    await waitFor(() => {
      const corner = container.querySelector('[class*="qrCorner"]');
      const svg = corner?.querySelector("svg");
      expect(svg?.getAttribute("width")).toBe("140");
    });
  });

  it("shows the effective total (entry offset + local nudge) in the offset pill", async () => {
    const roomWithOffset = {
      ...ROOM,
      queue: [{ ...ROOM.queue[0], originalOffsetSeconds: 2 }, ROOM.queue[1]],
    };
    vi.stubGlobal("fetch", fetchMockFor(roomWithOffset));
    render(<MusicVideoScreen />);
    await waitFor(() => expect(screen.queryByText(/Video offset/)).toBeNull());

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    });

    await waitFor(() => expect(screen.getByText("Video offset 2.5s")).toBeTruthy());
  });

  it("reports the entry's saved offset plus local arrow-key nudges when the song changes", async () => {
    vi.useFakeTimers();
    let pollCount = 0;
    const screenEventCalls: any[] = [];
    const roomWithOffset = {
      ...ROOM,
      queue: [{ ...ROOM.queue[0], originalOffsetSeconds: 2 }, ROOM.queue[1]],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (typeof url === "string" && url.includes("/api/analytics/screen-event")) {
          screenEventCalls.push(JSON.parse(String(init?.body)));
          return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
        }
        if (typeof url === "string" && url.includes("/original-video")) {
          return { ok: true, status: 200, json: async () => ({ status: "ok", videoIds: ["ov1"] }) } as Response;
        }
        pollCount += 1;
        return { ok: true, status: 200, json: async () => (pollCount === 1 ? roomWithOffset : { ...roomWithOffset, activeVideoIndex: 1 }) } as Response;
      })
    );

    render(<MusicVideoScreen />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    await vi.waitFor(() =>
      expect(screenEventCalls.some((c) => c.type === "music_video_offset")).toBe(true)
    );
    const offsetEvent = screenEventCalls.find((c) => c.type === "music_video_offset");
    expect(offsetEvent.data.offsetSeconds).toBe(3); // 2 (entry) + 1 (two 0.5s nudges)

    vi.useRealTimers();
  });

  it("a same-browser host broadcast overrides the polled entry offset in the reported total", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    MockBroadcastChannel.channels.clear();
    const { broadcastOriginalOffset } = await import("../../app/queue/roomChannel");

    let pollCount = 0;
    const screenEventCalls: any[] = [];
    const roomWithOffset = {
      ...ROOM,
      queue: [{ ...ROOM.queue[0], originalOffsetSeconds: 2 }, ROOM.queue[1]],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (typeof url === "string" && url.includes("/api/analytics/screen-event")) {
          screenEventCalls.push(JSON.parse(String(init?.body)));
          return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
        }
        if (typeof url === "string" && url.includes("/original-video")) {
          return { ok: true, status: 200, json: async () => ({ status: "ok", videoIds: ["ov1"] }) } as Response;
        }
        pollCount += 1;
        return { ok: true, status: 200, json: async () => (pollCount === 1 ? roomWithOffset : { ...roomWithOffset, activeVideoIndex: 1 }) } as Response;
      })
    );

    render(<MusicVideoScreen />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => {
      broadcastOriginalOffset("ROOM1", { entryId: "e1", offsetSeconds: 5 });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    await vi.waitFor(() =>
      expect(screenEventCalls.some((c) => c.type === "music_video_offset")).toBe(true)
    );
    const offsetEvent = screenEventCalls.find((c) => c.type === "music_video_offset");
    expect(offsetEvent.data.offsetSeconds).toBe(5); // the broadcast, not the polled entry's 2

    vi.useRealTimers();
  });

  it("names the singer on stage while the video plays", async () => {
    vi.stubGlobal("fetch", fetchMockFor(ROOM));
    const { container } = render(<MusicVideoScreen />);
    await waitFor(() => expect(container.querySelector("iframe")).toBeTruthy());
    expect(screen.getByText("Ana")).toBeTruthy();
    expect(screen.getByText("ON STAGE")).toBeTruthy();
  });
});
