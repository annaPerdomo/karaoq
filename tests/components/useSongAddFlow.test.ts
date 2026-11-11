import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const postEntryMock = vi.fn();
vi.mock("../../app/queue/postEntryToQueue", () => ({
  default: (...args: unknown[]) => postEntryMock(...args),
}));

import { useSongAddFlow } from "../../components/songsearch/hooks/useSongAddFlow";

const SONG = { videoId: "dQw4w9WgXcQ", title: "Song", thumbnailUrl: "t" };

function setup() {
  return renderHook(() =>
    useSongAddFlow({
      roomId: "ROOM1",
      userName: "Anna",
      requireName: false,
      onSongAdded: vi.fn(),
      resetSearch: vi.fn(),
      via: "paste",
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  postEntryMock.mockResolvedValue(true);
});

describe("useSongAddFlow external entries", () => {
  it("posts external: true for an external selection", async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.addSong({ ...SONG, external: true });
    });
    expect(postEntryMock.mock.calls[0][1].external).toBe(true);
  });

  it("posts no external field for a normal selection", async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.addSong(SONG);
    });
    expect(postEntryMock.mock.calls[0][1]).not.toHaveProperty("external");
  });
});
