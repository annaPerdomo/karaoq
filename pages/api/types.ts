export interface ApiError {
  code: number;
  message: string;
}

export interface Reaction {
  id: string;
  emoji: string;
  userName: string;
  timestamp: number;
}

/**
 * A "Sing with me" post: someone wants company on a song and broadcasts it so
 * others can join. Auto-adds to the queue once `minSingers` have joined; extra
 * singers can keep joining up to `maxSingers` until it plays.
 */
export interface SingWithMePost {
  id: string;
  songTitle: string;
  videoId: string;
  /** Empty string when posted anonymously. */
  createdBy: string;
  anonymous: boolean;
  /** Minimum singers before it auto-adds to the queue (>= 2). */
  minSingers: number;
  /** Cap on how many can join (>= minSingers). */
  maxSingers: number;
  /** Display names of everyone who has joined (includes creator when named). */
  joinedSingers: string[];
  /** True once auto-added to the queue. */
  queued: boolean;
  timestamp: number;
}

/**
 * A song requested for the room. Any singer can claim it ("I'll sing this"),
 * which queues it under their name. Supports the too-shy-to-sing case.
 */
export interface SuggestedSong {
  id: string;
  songTitle: string;
  videoId: string;
  /** Empty string when suggested anonymously. */
  suggestedBy: string;
  anonymous: boolean;
  timestamp: number;
}

export interface Room {
  id: string;
  queue: QueueEntry[];
  activeVideoIndex: number;
  isPlaying: boolean;
  reactionsEnabled: boolean;
  reactions?: Reaction[];
  singWithMe?: SingWithMePost[];
  suggestions?: SuggestedSong[];
  /** Set on insert; rooms created before expiry shipped lack these. */
  createdAt?: Date;
  /** Bumped on every write; drives the TTL index that expires stale rooms. */
  lastActivity?: Date;
}

export interface QueueEntry {
  id: string;
  userName: string;
  songTitle: string;
  videoId: string;
}
