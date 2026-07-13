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

/**
 * Where the room's video plays: on the host page itself ("here") or on a
 * separate display screen ("tv"). Stored on the room so every host device
 * agrees on the mode, not just the one that picked it.
 */
export type PlayMode = "here" | "tv";

export type QrSize = "large" | "normal" | "small" | "hidden";
export type DisplayTheme = "classic" | "minimal" | "neon";

export interface DisplayConfig {
  qrSize: QrSize;
  showUpNext: boolean;
  /** How many upcoming songs the sidebar lists. */
  upNextCount: 4 | 8 | 12 | 16;
  showNowPlaying: boolean;
  /** Whether the display renders the cheer overlay. Independent of the room-wide
   * reactionsEnabled flag (which controls whether the audience can SEND cheers). */
  showReactions: boolean;
  theme: DisplayTheme;
  /** Venue/host welcome line shown under the QR card and in attract mode. "" = none. */
  welcomeLine: string;
  /** Rotating promo panels when the room is idle (no current song). */
  attractMode: boolean;
}

export const DEFAULT_DISPLAY_CONFIG: DisplayConfig = {
  qrSize: "normal",
  showUpNext: true,
  upNextCount: 8,
  showNowPlaying: true,
  showReactions: true,
  theme: "classic",
  welcomeLine: "",
  attractMode: false,
};

export interface Room {
  id: string;
  queue: QueueEntry[];
  activeVideoIndex: number;
  isPlaying: boolean;
  reactionsEnabled: boolean;
  /** Unset on rooms where the host has never chosen a mode. */
  playMode?: PlayMode;
  /**
   * Random token minted by the device that started the current song in
   * "here" mode — that device is the playback surface. Cleared whenever
   * playback stops. Lets a reloading owner be told apart from a second
   * host device joining mid-song.
   */
  playToken?: string;
  /**
   * True while someone has paused the video on the display screen (reported
   * by the display's player watcher). Cleared whenever playback starts,
   * stops, or advances.
   */
  displayPaused?: boolean;
  /**
   * Heartbeat from any open display page (~10s cadence). A TV room that
   * claims to be playing with no recent heartbeat has orphaned playback —
   * the room GET clears it so host controls never show a phantom song.
   */
  displayLastSeen?: Date;
  /** When the current playback started; gives a just-pressed play a grace
   * window for a display to load before orphan-healing kicks in. */
  playStartedAt?: Date;
  /** Computed on GET (never stored): a display heartbeat was seen recently. */
  displayConnected?: boolean;
  reactions?: Reaction[];
  singWithMe?: SingWithMePost[];
  suggestions?: SuggestedSong[];
  /** Unset (legacy rooms) means shown — the display treats it as true. */
  boardsOnDisplay?: boolean;
  displayConfig?: DisplayConfig;
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
