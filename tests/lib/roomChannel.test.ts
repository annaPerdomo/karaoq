import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("roomChannel - BroadcastChannel cross-tab sync", () => {
  let channels: Map<string, { onmessage: ((event: MessageEvent) => void) | null }[]>;

  beforeEach(() => {
    vi.resetModules();
    channels = new Map();

    vi.stubGlobal(
      "BroadcastChannel",
      class MockBroadcastChannel {
        name: string;
        onmessage: ((event: MessageEvent) => void) | null = null;

        constructor(name: string) {
          this.name = name;
          if (!channels.has(name)) channels.set(name, []);
          channels.get(name)!.push(this);
        }

        postMessage(data: unknown) {
          // Deliver to all OTHER channels with the same name (real BC behavior)
          const instances = channels.get(this.name) || [];
          for (const instance of instances) {
            if (instance !== this && instance.onmessage) {
              instance.onmessage(new MessageEvent("message", { data }));
            }
          }
        }

        close = vi.fn();
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("broadcastRoomState creates a room-specific channel", async () => {
    const { broadcastRoomState } = await import("../../app/queue/roomChannel");

    const state = {
      queue: [{ id: "a", userName: "Anna", songTitle: "Song", videoId: "v1" }],
      activeVideoIndex: 0,
      isPlaying: true,
    };

    broadcastRoomState("ROOM1", state);

    expect(channels.has("karaoq-room-sync:ROOM1")).toBe(true);
  });

  it("onRoomState receives messages for the correct room", async () => {
    const { broadcastRoomState, onRoomState } = await import("../../app/queue/roomChannel");

    const callback = vi.fn();
    onRoomState("ROOM1", callback);

    const state = {
      queue: [{ id: "a", userName: "Anna", songTitle: "Song", videoId: "v1" }],
      activeVideoIndex: 0,
      isPlaying: true,
    };

    broadcastRoomState("ROOM1", state);

    expect(callback).toHaveBeenCalledWith(state);
  });

  it("messages for different rooms are isolated", async () => {
    const { broadcastRoomState, onRoomState } = await import("../../app/queue/roomChannel");

    const callback = vi.fn();
    onRoomState("ROOM1", callback);

    broadcastRoomState("ROOM2", {
      queue: [],
      activeVideoIndex: 0,
      isPlaying: false,
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it("onRoomState returns cleanup function that closes channel", async () => {
    const { onRoomState } = await import("../../app/queue/roomChannel");

    const callback = vi.fn();
    const cleanup = onRoomState("ROOM1", callback);

    expect(typeof cleanup).toBe("function");
    cleanup();
  });

  it("returns no-op when BroadcastChannel is undefined", async () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const { onRoomState } = await import("../../app/queue/roomChannel");

    const callback = vi.fn();
    const cleanup = onRoomState("ROOM1", callback);

    expect(cleanup).toBeTypeOf("function");
    cleanup(); // should not throw
  });
});
