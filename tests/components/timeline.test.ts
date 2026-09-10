import { describe, it, expect } from "vitest";
import {
  entryKind,
  mergeTimeline,
  searchRunLabel,
} from "../../components/admin/rooms/timeline";
import type { DossierSongRow, RoomErrorRow, RoomSearchFailRow, RoomSearchRow } from "../../components/admin/types";

const song: DossierSongRow = {
  userName: "Anna",
  songTitle: "Song",
  videoId: "v1",
  via: "search",
  timestamp: "2026-01-01T00:00:01.000Z",
};

const search: RoomSearchRow = {
  query: "some song",
  cache: "fresh",
  songKnown: null,
  resultCount: 12,
  timestamp: "2026-01-01T00:00:01.000Z",
};

const error: RoomErrorRow = {
  message: "boom",
  source: "client",
  timestamp: "2026-01-01T00:00:02.000Z",
};

const fail: RoomSearchFailRow = {
  failReason: "quota",
  searchOutcome: "error",
  timestamp: "2026-01-01T00:00:03.000Z",
};

describe("mergeTimeline", () => {
  it("sorts across all four inputs by timestamp ascending", () => {
    const entries = mergeTimeline({
      songs: [song],
      searchRuns: [search],
      errors: [error],
      searchFails: [fail],
    });
    expect(entries.map((e) => e.kind)).toEqual(["song", "search", "error", "searchFail"]);
  });

  it("keeps input order on a tie: song before search", () => {
    const entries = mergeTimeline({
      songs: [song],
      searchRuns: [search],
      errors: [],
      searchFails: [],
    });
    expect(entries[0].kind).toBe("song");
    expect(entries[1].kind).toBe("search");
  });
});

describe("entryKind", () => {
  it("maps error and searchFail to 'problem'", () => {
    expect(entryKind({ kind: "error", at: 0, error })).toBe("problem");
    expect(entryKind({ kind: "searchFail", at: 0, fail })).toBe("problem");
  });

  it("maps song to 'song' and search to 'search'", () => {
    expect(entryKind({ kind: "song", at: 0, song })).toBe("song");
    expect(entryKind({ kind: "search", at: 0, search })).toBe("search");
  });
});

describe("searchRunLabel", () => {
  it("fresh cache hit", () => {
    expect(
      searchRunLabel({ ...search, cache: "fresh", resultCount: 12, songKnown: null })
    ).toEqual({ cache: "cache hit", live: false, meta: "12 results" });
  });

  it("live search, known song", () => {
    expect(
      searchRunLabel({ ...search, cache: "miss", resultCount: 8, songKnown: true })
    ).toEqual({ cache: "live search", live: true, meta: "8 results · in corpus" });
  });

  it("live search, banked", () => {
    expect(
      searchRunLabel({ ...search, cache: "miss", resultCount: null, songKnown: false }).meta
    ).toBe("banked");
  });

  it("coalesced, stale, corpus", () => {
    expect(searchRunLabel({ ...search, cache: "coalesced" })).toMatchObject({
      cache: "cache hit",
      live: false,
    });
    expect(searchRunLabel({ ...search, cache: "stale" }).cache).toBe("stale cache");
    expect(searchRunLabel({ ...search, cache: "corpus" }).cache).toBe("corpus");
  });
});
