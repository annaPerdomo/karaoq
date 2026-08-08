import type { EventType } from "./analytics";
import type { QueueEntry, Room, SingWithMePost, SuggestedSong } from "../pages/api/types";

// YouTube's Developer Policies (III.E.4): API data not refreshed must be
// deleted within 30 days, statistics included. Everything derived from a search
// response — video ids, titles, thumbnails, durations, view counts — is governed
// by this one number.
export const YOUTUBE_DATA_MAX_AGE_DAYS = 30;
export const YOUTUBE_DATA_MAX_AGE_MS = YOUTUBE_DATA_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

export function youtubeDataCutoff(now: number = Date.now()): Date {
  return new Date(now - YOUTUBE_DATA_MAX_AGE_MS);
}

// Event types whose songTitle/songArtist/videoId originated in a YouTube API
// response. Every other type's fields are our own data and stay put.
export const YOUTUBE_DERIVED_EVENTS: EventType[] = [
  "song_added",
  "song_suggested",
  "suggestion_claimed",
  "singwithme_posted",
  "singwithme_joined",
  "singwithme_queued",
];

// suggestion_used is the exception: a "song_pick" or "genre_chip" title is from
// our own catalog, but a "trending" one is a cleaned-up YouTube video title.
export const YOUTUBE_DERIVED_SUGGESTION_SOURCE = "trending";

export const YOUTUBE_FIELDS = { songTitle: "", songArtist: "", videoId: "" };

export const HAS_YOUTUBE_FIELD = {
  $or: [
    { songTitle: { $exists: true } },
    { songArtist: { $exists: true } },
    { videoId: { $exists: true } },
  ],
};

/** True when this event's song fields came out of a YouTube API response, and
 * so may not be stored past 30 days. */
export function carriesYoutubeData(event: {
  type: EventType;
  suggestionSource?: string;
}): boolean {
  return (
    YOUTUBE_DERIVED_EVENTS.includes(event.type) ||
    (event.type === "suggestion_used" &&
      event.suggestionSource === YOUTUBE_DERIVED_SUGGESTION_SOURCE)
  );
}

export interface YoutubeSongData {
  dataId: string;
  roomId: string;
  type: EventType;
  /** Copied off the event so "trending in this country" can be computed
   * without joining back to a collection that outlives this one. */
  country?: string;
  songTitle?: string;
  songArtist?: string;
  videoId?: string;
  timestamp: Date;
}

/**
 * Copies the YouTube-derived fields into the doc that will hold them, or null
 * when nothing on the event is governed by the policy. **The caller must delete
 * the fields it hands over** — this stays pure so the migration script and the
 * write path can share it.
 */
export function splitYoutubeSongData(event: {
  type: EventType;
  roomId: string;
  timestamp: Date;
  country?: string;
  suggestionSource?: string;
  songTitle?: string;
  songArtist?: string;
  videoId?: string;
}, dataId: string = randomDataId()): YoutubeSongData | null {
  if (!carriesYoutubeData(event)) return null;
  if (!event.songTitle && !event.songArtist && !event.videoId) return null;
  return {
    dataId,
    roomId: event.roomId,
    type: event.type,
    ...(event.country ? { country: event.country } : {}),
    ...(event.songTitle ? { songTitle: event.songTitle } : {}),
    ...(event.songArtist ? { songArtist: event.songArtist } : {}),
    ...(event.videoId ? { videoId: event.videoId } : {}),
    timestamp: event.timestamp,
  };
}

function randomDataId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface RoomPrune {
  /** The room as it should now read — what the caller returns to the client. */
  queue: QueueEntry[];
  activeVideoIndex: number;
  singWithMe: SingWithMePost[];
  suggestions: SuggestedSong[];
  /** Ids to $pull. Removing by id rather than rewriting the arrays is what
   * keeps a concurrent song add from being clobbered: an entry queued between
   * our read and our write simply isn't in these lists. */
  removedQueueIds: string[];
  removedSingWithMeIds: string[];
  removedSuggestionIds: string[];
  /** How far activeVideoIndex must move down, applied as a relative $inc so it
   * stays correct against a concurrent write too. */
  activeIndexShift: number;
}

/**
 * The room half of the 30-day rule: a room is deleted 30 days after its last
 * activity, but a venue running KaraoQ every weekend never goes idle, so its
 * oldest entries would otherwise sit there forever. Null when nothing has
 * expired, so the caller can skip the write.
 */
export function pruneRoomYoutubeData(
  room: Room,
  now: number = Date.now()
): RoomPrune | null {
  const cutoff = now - YOUTUBE_DATA_MAX_AGE_MS;
  // Entries queued before addedAt shipped can only be dated by the room that
  // holds them: a room created before the cutoff cannot hold a newer one.
  const roomCreatedMs = room.createdAt ? new Date(room.createdAt).getTime() : 0;
  const queue = room.queue ?? [];
  const activeVideoIndex = room.activeVideoIndex ?? 0;

  const keptQueue: QueueEntry[] = [];
  const removedQueueIds: string[] = [];
  let activeIndexShift = 0;
  queue.forEach((entry, index) => {
    const addedAt = typeof entry.addedAt === "number" ? entry.addedAt : roomCreatedMs;
    // The song on screen is left alone — dropping it mid-playback would blank
    // the display. It goes in the next sweep, once the room has moved on.
    if (addedAt < cutoff && index !== activeVideoIndex) {
      // Removing an already-played entry shifts everything after it, so the
      // pointer into the queue has to move with it.
      if (index < activeVideoIndex) activeIndexShift += 1;
      removedQueueIds.push(entry.id);
      return;
    }
    keptQueue.push(entry);
  });

  const expired = <T extends { timestamp: number }>(rows: T[]) =>
    rows.filter((row) => row.timestamp < cutoff);
  const allSingWithMe = room.singWithMe ?? [];
  const allSuggestions = room.suggestions ?? [];
  const removedSingWithMeIds = expired(allSingWithMe).map((p) => p.id);
  const removedSuggestionIds = expired(allSuggestions).map((s) => s.id);

  if (
    removedQueueIds.length === 0 &&
    removedSingWithMeIds.length === 0 &&
    removedSuggestionIds.length === 0
  ) {
    return null;
  }

  return {
    queue: keptQueue,
    activeVideoIndex: activeVideoIndex - activeIndexShift,
    singWithMe: allSingWithMe.filter((p) => p.timestamp >= cutoff),
    suggestions: allSuggestions.filter((s) => s.timestamp >= cutoff),
    removedQueueIds,
    removedSingWithMeIds,
    removedSuggestionIds,
    activeIndexShift,
  };
}

/** Never bumps lastActivity: this is our write, not the room's, and bumping it
 * would push the room's own expiry out. */
export function roomPruneUpdate(pruned: RoomPrune): Record<string, unknown> {
  const pull: Record<string, unknown> = {};
  if (pruned.removedQueueIds.length) pull.queue = { id: { $in: pruned.removedQueueIds } };
  if (pruned.removedSingWithMeIds.length) {
    pull.singWithMe = { id: { $in: pruned.removedSingWithMeIds } };
  }
  if (pruned.removedSuggestionIds.length) {
    pull.suggestions = { id: { $in: pruned.removedSuggestionIds } };
  }
  return {
    $pull: pull,
    ...(pruned.activeIndexShift
      ? { $inc: { activeVideoIndex: -pruned.activeIndexShift } }
      : {}),
  };
}
