import type { Locale } from "../../lib/i18n/config";

export interface ApiError {
  code: number;
  message: string;
}

export type FeedbackKind = "bug" | "idea" | "other";

export const FEEDBACK_KINDS: FeedbackKind[] = ["bug", "idea", "other"];

/** Its own collection, deliberately outside analytics: read one at a time by a
 * human, and never expired. */
export interface FeedbackEntry {
  kind: FeedbackKind;
  message: string;
  /** "" when they left no address. */
  contact: string;
  roomId?: string;
  role?: "host" | "singer";
  /** Separates a landing-page suggestion from an in-room bug. */
  page?: string;
  locale?: Locale;
  country?: string;
  userAgent?: string;
  handled?: boolean;
  createdAt: Date;
}

export interface Reaction {
  id: string;
  emoji: string;
  userName: string;
  timestamp: number;
}

/** Auto-adds to the queue at `minSingers` joins; joinable up to `maxSingers` until played. */
export interface SingWithMePost {
  id: string;
  songTitle: string;
  videoId: string;
  /** Video length, carried onto the queue entry so time estimates stay honest. */
  durationSeconds?: number;
  /** "" when anonymous. */
  createdBy: string;
  anonymous: boolean;
  minSingers: number;
  maxSingers: number;
  joinedSingers: string[];
  queued: boolean;
  timestamp: number;
}

/** A requested song any singer can claim, queueing it under their name. */
export interface SuggestedSong {
  id: string;
  songTitle: string;
  videoId: string;
  /** Video length, carried onto the queue entry when the song is claimed. */
  durationSeconds?: number;
  /** "" when anonymous. */
  suggestedBy: string;
  anonymous: boolean;
  timestamp: number;
}

/** Stored on the room so every host device agrees on where video plays. */
export type PlayMode = "here" | "tv";

export type QrSize = "large" | "normal" | "small" | "hidden";
export type DisplayTheme = "classic" | "minimal" | "neon";

export const DISPLAY_THEMES: DisplayTheme[] = ["classic", "minimal", "neon"];
export type SidebarPosition = "left" | "right";
export type SidebarSection = "qr" | "banner" | "upNext" | "boards";

/** "queue" reorders like the rest but can never be hidden. */
export type HostSection = "queue" | "boards" | "qr" | "banner";

/** Coarse-bucket px — the qrPx fallback for configs predating fine-grained sizing. */
export const QR_SIZE_PX: Record<Exclude<QrSize, "hidden">, number> = {
  small: 48,
  normal: 80,
  large: 120,
};

/** Kept in sync with qrPx so stale displays approximate the dragged size. */
export function nearestQrSize(px: number): Exclude<QrSize, "hidden"> {
  return px <= 60 ? "small" : px <= 100 ? "normal" : "large";
}

// Fills fields missing from older stored configs. qrPx must follow the stored
// qrSize bucket, not the default, or an old "large" QR renders at normal size.
export function normalizeDisplayConfig(stored: DisplayConfig | undefined): DisplayConfig {
  const merged = { ...DEFAULT_DISPLAY_CONFIG, ...stored };
  if (stored && stored.qrPx === undefined && stored.qrSize && stored.qrSize !== "hidden") {
    merged.qrPx = QR_SIZE_PX[stored.qrSize];
  }
  // Retired welcomeLine migrates into the banner; an existing banner wins.
  const legacyWelcome = (stored as { welcomeLine?: string } | undefined)?.welcomeLine;
  if (legacyWelcome && !merged.bannerLine) merged.bannerLine = legacyWelcome;
  // Drop retired sections (pickKnown can't see inside the array — a leftover
  // would fail the endpoint's exactly-once check), then backfill new ones.
  merged.sidebarOrder = merged.sidebarOrder.filter((s) =>
    DEFAULT_DISPLAY_CONFIG.sidebarOrder.includes(s)
  );
  const missing = DEFAULT_DISPLAY_CONFIG.sidebarOrder.filter(
    (s) => !merged.sidebarOrder.includes(s)
  );
  if (missing.length) merged.sidebarOrder = [...merged.sidebarOrder, ...missing];
  if (!DISPLAY_THEMES.includes(merged.theme)) {
    merged.theme = DEFAULT_DISPLAY_CONFIG.theme;
  }
  // Retired fields carried forward would fail the endpoint's unknown-key check.
  return pickKnown(merged, DEFAULT_DISPLAY_CONFIG);
}

function pickKnown<C extends object>(value: C, shape: C): C {
  const out = {} as C;
  (Object.keys(shape) as (keyof C)[]).forEach((key) => {
    out[key] = value[key];
  });
  return out;
}

// Ranges are enforced in lib/limits.ts.
export interface DisplayConfig {
  /** Coarse fallback for displays predating qrPx; "hidden" hides the card. */
  qrSize: QrSize;
  qrPx: number;
  showUpNext: boolean;
  showNowPlaying: boolean;
  theme: DisplayTheme;
  sidebarPosition: SidebarPosition;
  sidebarWidth: number;
  /** Always all four sections. */
  sidebarOrder: SidebarSection[];
  /** "" = none, which hides the section. Absorbed the retired welcomeLine. */
  bannerLine: string;
  bannerPx: number;
  nowPlayingHeight: number;
}

export const DEFAULT_DISPLAY_CONFIG: DisplayConfig = {
  qrSize: "normal",
  qrPx: 80,
  showUpNext: true,
  showNowPlaying: true,
  theme: "classic",
  sidebarPosition: "right",
  sidebarWidth: 280,
  sidebarOrder: ["qr", "banner", "upNext", "boards"],
  bannerLine: "",
  bannerPx: 18,
  nowPlayingHeight: 132,
};

/** Fields differing from defaults; feeds the display_config_saved event. */
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

/** Host-surface twin of DisplayConfig, stored on the room so all host devices
 * share one layout. Ranges enforced in lib/limits.ts. */
export interface HostConfig {
  theme: DisplayTheme;
  sidebarPosition: SidebarPosition;
  sidebarWidth: number;
  showBoards: boolean;
  showQr: boolean;
  /** Twin of DisplayConfig.showUpNext — the host's queue panel. */
  showQueue: boolean;
  /** Twin of DisplayConfig.showNowPlaying — the host's bar carries playback
   * controls too, which is the only real difference between the two surfaces. */
  showTransport: boolean;
  /** No coarse bucket: this QR never renders on a stale client. */
  qrPx: number;
  nowPlayingHeight: number;
  /** "" = none, which hides the section. */
  bannerLine: string;
  bannerPx: number;
  sectionOrder: HostSection[];
}

export const DEFAULT_HOST_CONFIG: HostConfig = {
  theme: "classic",
  sidebarPosition: "right",
  sidebarWidth: 360,
  showBoards: true,
  showQr: true,
  showQueue: true,
  showTransport: true,
  qrPx: 72,
  nowPlayingHeight: 64,
  bannerLine: "",
  bannerPx: 16,
  sectionOrder: ["queue", "banner", "boards", "qr"],
};

/** Same contract as normalizeDisplayConfig. */
export function normalizeHostConfig(stored: HostConfig | undefined): HostConfig {
  const merged = { ...DEFAULT_HOST_CONFIG, ...stored };
  merged.sectionOrder = merged.sectionOrder.filter((s) =>
    DEFAULT_HOST_CONFIG.sectionOrder.includes(s)
  );
  const missing = DEFAULT_HOST_CONFIG.sectionOrder.filter(
    (s) => !merged.sectionOrder.includes(s)
  );
  if (missing.length) merged.sectionOrder = [...merged.sectionOrder, ...missing];
  if (!DISPLAY_THEMES.includes(merged.theme)) {
    merged.theme = DEFAULT_HOST_CONFIG.theme;
  }
  return pickKnown(merged, DEFAULT_HOST_CONFIG);
}

/** Fields differing from defaults; feeds the host_config_saved event. */
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
  playMode?: PlayMode;
  /** Minted by the device that started the song in "here" mode — tells a
   * reloading owner apart from a second host device. Cleared on stop. */
  playToken?: string;
  displayPaused?: boolean;
  /** Display heartbeat (~10s); the room GET clears playing state with no
   * recent heartbeat so host controls never show a phantom song. */
  displayLastSeen?: Date;
  /** Grace window for a display to load before orphan-healing kicks in. */
  playStartedAt?: Date;
  /** When the current pause began. Freezes the queue-time estimate while the
   * room stands still; on resume, playStartedAt moves forward by its length. */
  playPausedAt?: Date;
  /** Computed on GET, never stored. */
  displayConnected?: boolean;
  /** The server's clock at response time, so viewers can measure elapsed
   * playback against it instead of their own drifting one. Never stored. */
  serverNow?: number;
  reactions?: Reaction[];
  singWithMe?: SingWithMePost[];
  suggestions?: SuggestedSong[];
  /** Unset (legacy rooms) means shown. */
  boardsOnDisplay?: boolean;
  /** New songs insert at their round-robin slot (lib/fairQueue). Absent = off. */
  fairMode?: boolean;
  displayConfig?: DisplayConfig;
  hostConfig?: HostConfig;
  /** Wall-clock end of the booked slot / the night. Absent = open-ended. */
  sessionEndsAt?: Date;
  createdAt?: Date;
  /** Bumped on every write; drives the TTL index. */
  lastActivity?: Date;
}

export interface QueueEntry {
  id: string;
  userName: string;
  songTitle: string;
  videoId: string;
  /** Video length from search metadata. Absent on entries queued before this
   * shipped, on degraded search results, and on board songs picked without it —
   * lib/queueTime falls back to the room's own average. */
  durationSeconds?: number;
  /** Epoch ms at queue time — the order fair-mode-off restores, since fair
   * rotation destroys array-position-as-arrival. Absent on legacy entries. */
  addedAt?: number;
}
