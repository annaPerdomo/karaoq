import { describe, it, expect } from "vitest";
import type { QueueEntry, Room, SingWithMePost, SuggestedSong } from "../../pages/api/types";
import {
  YOUTUBE_DATA_MAX_AGE_MS,
  carriesYoutubeData,
  pruneRoomYoutubeData,
  roomPruneUpdate,
  splitYoutubeSongData,
  youtubeDataCutoff,
} from "../../lib/youtubeRetention";

const NOW = Date.UTC(2026, 7, 7, 20, 0, 0);
const OLD = NOW - YOUTUBE_DATA_MAX_AGE_MS - 60_000;
const RECENT = NOW - 60_000;

function entry(id: string, addedAt?: number): QueueEntry {
  return {
    id,
    userName: `Singer ${id}`,
    songTitle: `Song ${id}`,
    videoId: `vid${id}`,
    ...(addedAt !== undefined ? { addedAt } : {}),
  };
}

function post(id: string, timestamp: number): SingWithMePost {
  return {
    id,
    songTitle: `Song ${id}`,
    videoId: `vid${id}`,
    createdBy: "Ana",
    anonymous: false,
    minSingers: 2,
    maxSingers: 4,
    joinedSingers: [],
    queued: false,
    timestamp,
  };
}

function suggestion(id: string, timestamp: number): SuggestedSong {
  return {
    id,
    songTitle: `Song ${id}`,
    videoId: `vid${id}`,
    suggestedBy: "Ana",
    anonymous: false,
    timestamp,
  };
}

function room(overrides: Partial<Room>): Room {
  return {
    id: "ABC123",
    queue: [],
    activeVideoIndex: 0,
    isPlaying: false,
    reactionsEnabled: true,
    createdAt: new Date(NOW - YOUTUBE_DATA_MAX_AGE_MS * 3),
    ...overrides,
  };
}

describe("youtubeDataCutoff", () => {
  it("is 30 days before the given moment", () => {
    expect(youtubeDataCutoff(NOW).toISOString()).toBe(
      new Date(NOW - 30 * 24 * 60 * 60 * 1000).toISOString()
    );
  });
});

describe("pruneRoomYoutubeData", () => {
  it("returns null when nothing has expired", () => {
    const target = room({
      queue: [entry("a", RECENT), entry("b", RECENT)],
      singWithMe: [post("c", RECENT)],
      suggestions: [suggestion("d", RECENT)],
    });
    expect(pruneRoomYoutubeData(target, NOW)).toBeNull();
  });

  it("drops queue entries older than 30 days", () => {
    const target = room({
      queue: [entry("old", OLD), entry("new", RECENT)],
      activeVideoIndex: 1,
    });
    const pruned = pruneRoomYoutubeData(target, NOW)!;
    expect(pruned.queue.map((e) => e.id)).toEqual(["new"]);
    expect(pruned.removedQueueIds).toEqual(["old"]);
  });

  it("shifts activeVideoIndex to stay on the same song", () => {
    const target = room({
      queue: [entry("a", OLD), entry("b", OLD), entry("c", RECENT), entry("d", RECENT)],
      activeVideoIndex: 2,
    });
    const pruned = pruneRoomYoutubeData(target, NOW)!;
    expect(pruned.queue.map((e) => e.id)).toEqual(["c", "d"]);
    expect(pruned.queue[pruned.activeVideoIndex].id).toBe("c");
  });

  it("keeps the entry that is playing even when it is expired", () => {
    const target = room({
      queue: [entry("a", OLD), entry("playing", OLD), entry("c", OLD)],
      activeVideoIndex: 1,
    });
    const pruned = pruneRoomYoutubeData(target, NOW)!;
    expect(pruned.queue.map((e) => e.id)).toEqual(["playing"]);
    expect(pruned.activeVideoIndex).toBe(0);
  });

  it("handles an index parked past the end of the queue", () => {
    const target = room({
      queue: [entry("a", OLD), entry("b", OLD)],
      activeVideoIndex: 2,
    });
    const pruned = pruneRoomYoutubeData(target, NOW)!;
    expect(pruned.queue).toEqual([]);
    expect(pruned.activeVideoIndex).toBe(0);
  });

  it("dates entries with no addedAt by the room's creation time", () => {
    const legacy = room({ queue: [entry("legacy")], activeVideoIndex: 1 });
    expect(pruneRoomYoutubeData(legacy, NOW)!.queue).toEqual([]);

    const young = room({
      createdAt: new Date(RECENT),
      queue: [entry("legacy")],
      activeVideoIndex: 1,
    });
    expect(pruneRoomYoutubeData(young, NOW)).toBeNull();
  });

  it("drops expired sing-with-me posts and song requests", () => {
    const target = room({
      queue: [entry("a", RECENT)],
      singWithMe: [post("old", OLD), post("new", RECENT)],
      suggestions: [suggestion("old", OLD), suggestion("new", RECENT)],
    });
    const pruned = pruneRoomYoutubeData(target, NOW)!;
    expect(pruned.singWithMe.map((p) => p.id)).toEqual(["new"]);
    expect(pruned.suggestions.map((s) => s.id)).toEqual(["new"]);
    expect(pruned.removedSingWithMeIds).toEqual(["old"]);
    expect(pruned.removedSuggestionIds).toEqual(["old"]);
    expect(pruned.removedQueueIds).toEqual([]);
  });
});

describe("roomPruneUpdate", () => {
  it("pulls by id and moves the index relatively, never rewriting the array", () => {
    const target = room({
      queue: [entry("a", OLD), entry("b", OLD), entry("c", RECENT)],
      activeVideoIndex: 2,
      suggestions: [suggestion("s", OLD)],
    });
    const update = roomPruneUpdate(pruneRoomYoutubeData(target, NOW)!);
    expect(update).toEqual({
      $pull: {
        queue: { id: { $in: ["a", "b"] } },
        suggestions: { id: { $in: ["s"] } },
      },
      $inc: { activeVideoIndex: -2 },
    });
    // A wholesale $set of queue would clobber a song added between our read
    // and our write; nothing here touches an entry we didn't see expired.
    expect(update.$set).toBeUndefined();
    expect(update.$pull).not.toHaveProperty("singWithMe");
  });

  it("omits the index shift when only later entries expired", () => {
    const target = room({
      queue: [entry("playing", RECENT), entry("old", OLD)],
      activeVideoIndex: 0,
    });
    const update = roomPruneUpdate(pruneRoomYoutubeData(target, NOW)!);
    expect(update.$inc).toBeUndefined();
  });
});

describe("splitYoutubeSongData", () => {
  const base = { roomId: "ABC123", timestamp: new Date(NOW), country: "US" };

  it("moves a queued song's YouTube fields into their own doc", () => {
    const split = splitYoutubeSongData(
      { ...base, type: "song_added", songTitle: "Song (Karaoke)", videoId: "vid1" },
      "fixed-id"
    )!;
    expect(split).toEqual({
      dataId: "fixed-id",
      roomId: "ABC123",
      type: "song_added",
      country: "US",
      songTitle: "Song (Karaoke)",
      videoId: "vid1",
      timestamp: new Date(NOW),
    });
  });

  it("leaves our own catalog's suggestion titles alone", () => {
    expect(carriesYoutubeData({ type: "suggestion_used", suggestionSource: "song_pick" })).toBe(
      false
    );
    expect(
      splitYoutubeSongData({
        ...base,
        type: "suggestion_used",
        suggestionSource: "song_pick",
        songTitle: "Bohemian Rhapsody",
        songArtist: "Queen",
      })
    ).toBeNull();
  });

  it("treats a trending suggestion as YouTube data, since its title is a video title", () => {
    expect(carriesYoutubeData({ type: "suggestion_used", suggestionSource: "trending" })).toBe(true);
    expect(
      splitYoutubeSongData({
        ...base,
        type: "suggestion_used",
        suggestionSource: "trending",
        songTitle: "Sweet Caroline",
      })
    ).not.toBeNull();
  });

  it("returns null for an event carrying no song at all", () => {
    expect(splitYoutubeSongData({ ...base, type: "song_added" })).toBeNull();
    expect(splitYoutubeSongData({ ...base, type: "room_created" })).toBeNull();
  });
});
