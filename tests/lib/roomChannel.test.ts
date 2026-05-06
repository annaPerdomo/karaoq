import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { broadcastRoomState, onRoomState, RoomStateMessage } from "../../app/queue/roomChannel";

describe("roomChannel - BroadcastChannel cross-tab sync", () => {
  let postedMessages: unknown[] = [];
  let listeners: Map<string, ((event: MessageEvent) => void)[]>;

  beforeEach(() => {
    postedMessages = [];
    listeners = new Map();

    vi.stubGlobal(
      "BroadcastChannel",
      class MockBroadcastChannel {
        name: string;
        onmessage: ((event: MessageEvent) => void) | null = null;

        constructor(name: string) {
          this.name = name;
          if (!listeners.has(name)) listeners.set(name, []);
        }

        postMessage(data: unknown) {
          postedMessages.push(data);
          // Deliver to all listeners on this channel
          const channelListeners = listeners.get(this.name) || [];
          for (const listener of channelListeners) {
            listener(new MessageEvent("message", { data }));
          }
        }

        close = vi.fn();

        set _onmessage(fn: ((event: MessageEvent) => void) | null) {
          if (fn) {
            const channelListeners = listeners.get(this.name) || [];
            channelListeners.push(fn);
            listeners.set(this.name, channelListeners);
          }
        }
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("broadcastRoomState posts message to channel", () => {
    const state: RoomStateMessage = {
      queue: [{ id: "a", userName: "Anna", songTitle: "Song", videoId: "v1" }],
      activeVideoIndex: 0,
      isPlaying: true,
    };

    broadcastRoomState(state);

    expect(postedMessages).toHaveLength(1);
    expect(postedMessages[0]).toEqual(state);
  });

  it("onRoomState returns cleanup function", () => {
    const callback = vi.fn();
    const cleanup = onRoomState(callback);

    expect(typeof cleanup).toBe("function");
    cleanup();
  });

  it("returns no-op when BroadcastChannel is undefined", () => {
    vi.stubGlobal("BroadcastChannel", undefined);

    const callback = vi.fn();
    const cleanup = onRoomState(callback);

    expect(cleanup).toBeTypeOf("function");
    cleanup(); // should not throw
  });
});
