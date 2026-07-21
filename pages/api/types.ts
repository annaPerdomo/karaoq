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

export const DISPLAY_THEMES: DisplayTheme[] = ["classic", "minimal", "neon"];
export type SidebarPosition = "left" | "right";
export type SidebarSection = "qr" | "welcome" | "upNext" | "boards";

/** The host sidebar's arrangeable sections — the host page's analogue of
 * SidebarSection. "queue" is the tabs + add button + queue/history list; it
 * reorders like the rest but can never be hidden (it's the point of the page).
 * The cheer bar is deliberately absent: it's a run-time setting (the gear's
 * reactions toggle), not a layout choice. */
export type HostSection = "queue" | "boards" | "qr";

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
  // Backfill sidebar sections added after a config was saved (e.g. "boards"),
  // appended in default order — an older 3-section order still renders every
  // section, in the same trailing spot boards previously occupied.
  const missing = DEFAULT_DISPLAY_CONFIG.sidebarOrder.filter(
    (s) => !merged.sidebarOrder.includes(s)
  );
  if (missing.length) merged.sidebarOrder = [...merged.sidebarOrder, ...missing];
  // Rooms saved while the retired palettes existed still carry them; fall back
  // to the default look rather than rendering an unknown theme class.
  if (!DISPLAY_THEMES.includes(merged.theme)) {
    merged.theme = DEFAULT_DISPLAY_CONFIG.theme;
  }
  // Drop fields that no longer exist (e.g. the retired showReactions). Carrying
  // them forward would make the next save fail the endpoint's unknown-key check.
  return pickKnown(merged, DEFAULT_DISPLAY_CONFIG);
}

/** Rebuild an object from only the keys present in `shape`, so retired fields
 * on a stored config don't ride along into the next write. */
function pickKnown<C extends object>(value: C, shape: C): C {
  const out = {} as C;
  (Object.keys(shape) as (keyof C)[]).forEach((key) => {
    out[key] = value[key];
  });
  return out;
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
  theme: DisplayTheme;
  /** Which edge of the TV the QR/up-next sidebar sits on. */
  sidebarPosition: SidebarPosition;
  /** Sidebar width in px (220–460); the host drags the sidebar's inner edge. */
  sidebarWidth: number;
  /** Top-to-bottom order of the sidebar sections; always all four. */
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
  theme: "classic",
  sidebarPosition: "right",
  sidebarWidth: 280,
  sidebarOrder: ["qr", "welcome", "upNext", "boards"],
  welcomeLine: "",
  attractMode: false,
};

/** Which fields of a saved config differ from the defaults. Feeds the
 * display_config_saved analytics event, so what hosts actually change can
 * argue for moving the defaults themselves. */
export function displayConfigChangedFields(
  config: DisplayConfig
): (keyof DisplayConfig)[] {
  return (Object.keys(DEFAULT_DISPLAY_CONFIG) as (keyof DisplayConfig)[]).filter(
    (key) => {
      const value = config[key];
      const fallback = DEFAULT_DISPLAY_CONFIG[key];
      if (Array.isArray(value) && Array.isArray(fallback)) {
        return value.join(",") !== fallback.join(",");
      }
      return value !== fallback;
    }
  );
}

/**
 * Per-room customization of the HOST control surface — the organizer's own
 * screen, not the TV. Mirrors DisplayConfig: stored on the room so every host
 * device (and co-hosts) share one layout, edited in place via the same
 * Customize mode. Theme reuses the display's palette union.
 */
export interface HostConfig {
  /** Palette for the host surface — same set the display offers. */
  theme: DisplayTheme;
  /** Which edge the queue sidebar docks to. */
  sidebarPosition: SidebarPosition;
  /** Sidebar width in px (220–460); the host drags the sidebar's inner edge. */
  sidebarWidth: number;
  /** The History tab in the sidebar. */
  showHistory: boolean;
  /** The read-only boards roll-up (requests & sing-together). */
  showBoards: boolean;
  /** The join-QR shelf. */
  showQr: boolean;
  /** Exact QR pixel size the host dragged to (48–140), same bounds as the
   * display's. No coarse bucket here — this QR only ever renders on the host's
   * own screen, so there's no stale-client fallback to keep in sync. */
  qrPx: number;
  /** Top-to-bottom order of the sidebar's sections. */
  sectionOrder: HostSection[];
}

export const DEFAULT_HOST_CONFIG: HostConfig = {
  theme: "classic",
  sidebarPosition: "right",
  sidebarWidth: 360,
  showHistory: true,
  showBoards: true,
  showQr: true,
  qrPx: 72,
  sectionOrder: ["queue", "boards", "qr"],
};

/** Fill a stored host config's missing fields with defaults, and backfill any
 * sections added after it was saved (appended in default order) — same
 * contract as normalizeDisplayConfig. */
export function normalizeHostConfig(stored: HostConfig | undefined): HostConfig {
  const merged = { ...DEFAULT_HOST_CONFIG, ...stored };
  const missing = DEFAULT_HOST_CONFIG.sectionOrder.filter(
    (s) => !merged.sectionOrder.includes(s)
  );
  if (missing.length) merged.sectionOrder = [...merged.sectionOrder, ...missing];
  if (!DISPLAY_THEMES.includes(merged.theme)) {
    merged.theme = DEFAULT_HOST_CONFIG.theme;
  }
  return pickKnown(merged, DEFAULT_HOST_CONFIG);
}

/** Which fields of a saved host config differ from the defaults. Feeds the
 * host_config_saved analytics event. */
export function hostConfigChangedFields(
  config: HostConfig
): (keyof HostConfig)[] {
  return (Object.keys(DEFAULT_HOST_CONFIG) as (keyof HostConfig)[]).filter(
    (key) => {
      const value = config[key];
      const fallback = DEFAULT_HOST_CONFIG[key];
      if (Array.isArray(value) && Array.isArray(fallback)) {
        return value.join(",") !== fallback.join(",");
      }
      return value !== fallback;
    }
  );
}

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
  /** Fair rotation: while on, new songs are inserted at their round-robin
   * position instead of appended (lib/fairQueue). Absent/false = off. */
  fairMode?: boolean;
  displayConfig?: DisplayConfig;
  /** Per-room customization of the host control surface. Unset rooms use
   * DEFAULT_HOST_CONFIG. */
  hostConfig?: HostConfig;
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
  /**
   * When the song was queued, as epoch ms. This is what "sorted by queue
   * time" means: fair rotation reorders the array, so array position stops
   * being a record of arrival and turning the mode back off would have
   * nothing to restore. Optional because entries queued before this field
   * existed don't have it — see lib/fairQueue for how those are ordered.
   */
  addedAt?: number;
}
