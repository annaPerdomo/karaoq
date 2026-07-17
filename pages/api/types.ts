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
export type DisplayTheme =
  | "classic"
  | "minimal"
  | "neon"
  | "sunset"
  | "ocean"
  | "gold"
  | "forest"
  | "pastel"
  | "party";
export type SidebarPosition = "left" | "right";
export type SidebarSection = "qr" | "welcome" | "upNext";

/** Pixel size each coarse QR bucket renders at (also the qrPx fallback for
 * configs written before fine-grained sizing existed). */
export const QR_SIZE_PX: Record<Exclude<QrSize, "hidden">, number> = {
  small: 48,
  normal: 80,
  large: 120,
};

/** Coarse bucket a dragged QR size lands in — kept alongside qrPx so displays
 * that predate fine-grained sizing still approximate the host's intent. */
export function nearestQrSize(px: number): Exclude<QrSize, "hidden"> {
  return px <= 60 ? "small" : px <= 100 ? "normal" : "large";
}

/** Fill a stored config's missing fields with defaults. Configs written before
 * a field existed lack it; qrPx in particular must follow the stored qrSize
 * bucket, not the default, or an old "large" QR would render at normal size. */
export function normalizeDisplayConfig(stored: DisplayConfig | undefined): DisplayConfig {
  const merged = { ...DEFAULT_DISPLAY_CONFIG, ...stored };
  if (stored && stored.qrPx === undefined && stored.qrSize && stored.qrSize !== "hidden") {
    merged.qrPx = QR_SIZE_PX[stored.qrSize];
  }
  return merged;
}

export interface DisplayConfig {
  /** "hidden" hides the card; the size buckets are a coarse fallback for
   * displays that predate the fine-grained qrPx below. */
  qrSize: QrSize;
  /** Exact QR pixel size the host dragged to (48–140). Kept in sync with the
   * nearest qrSize bucket so stale displays still approximate it. */
  qrPx: number;
  showUpNext: boolean;
  /** How many upcoming songs the sidebar lists (1–20). */
  upNextCount: number;
  showNowPlaying: boolean;
  /** Whether the display renders the cheer overlay. Independent of the room-wide
   * reactionsEnabled flag (which controls whether the audience can SEND cheers). */
  showReactions: boolean;
  theme: DisplayTheme;
  /** Which edge of the TV the QR/up-next sidebar sits on. */
  sidebarPosition: SidebarPosition;
  /** Sidebar width in px (220–460); the host drags the sidebar's inner edge. */
  sidebarWidth: number;
  /** Top-to-bottom order of the sidebar sections; always all three. */
  sidebarOrder: SidebarSection[];
  /** Venue/host welcome line shown under the QR card and in attract mode. "" = none. */
  welcomeLine: string;
  /** Rotating promo panels when the room is idle (no current song). */
  attractMode: boolean;
}

export const DEFAULT_DISPLAY_CONFIG: DisplayConfig = {
  qrSize: "normal",
  qrPx: 80,
  showUpNext: true,
  upNextCount: 8,
  showNowPlaying: true,
  showReactions: true,
  theme: "classic",
  sidebarPosition: "right",
  sidebarWidth: 280,
  sidebarOrder: ["qr", "welcome", "upNext"],
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
