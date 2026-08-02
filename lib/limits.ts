import type { NextApiRequest } from "next";
import type { DisplayConfig, HostConfig, QueueEntry, SingWithMePost, SuggestedSong } from "../pages/api/types";
import { DISPLAY_THEMES as DISPLAY_THEME_LIST } from "../pages/api/types";

// Server-side caps on anonymous writes: the UI enforces friendlier limits; these stop curl from
// ballooning a room document or filling the 512MB Atlas free tier.
export const MAX_QUEUE_LENGTH = 200;
export const MAX_NAME_LENGTH = 30;
export const MAX_TITLE_LENGTH = 200;
export const MAX_ENTRY_ID_LENGTH = 64;
export const MAX_SING_WITH_ME = 30;
export const MAX_SUGGESTIONS = 50;
export const MAX_SINGERS = 20;
export const MAX_BANNER_LENGTH = 80;

// YouTube video IDs are exactly 11 URL-safe base64 characters.
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

// Song lengths outside this range are never a karaoke track (a 5-second clip, a
// 24/7 livestream) and would wreck the queue-time estimate, so they're dropped
// rather than stored. Absent is fine — lib/queueTime falls back.
export const MIN_SONG_SECONDS = 30;
export const MAX_SONG_SECONDS = 1800;

/** Whole seconds when plausible, undefined otherwise. Callers drop a bad value
 * instead of rejecting the write — a song must never be lost to bad metadata. */
export function sanitizeSongDuration(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const seconds = Math.round(value);
  return seconds >= MIN_SONG_SECONDS && seconds <= MAX_SONG_SECONDS
    ? seconds
    : undefined;
}

/** Optional: absent stays absent, present must be a plausible song length. */
export function isValidSongDuration(value: unknown): boolean {
  return value === undefined || sanitizeSongDuration(value) !== undefined;
}

export function isValidQueueEntry(entry: unknown): entry is QueueEntry {
  if (!entry || typeof entry !== "object") return false;
  const e = entry as Record<string, unknown>;
  return (
    isValidSongDuration(e.durationSeconds) &&
    typeof e.id === "string" &&
    e.id.length > 0 &&
    e.id.length <= MAX_ENTRY_ID_LENGTH &&
    typeof e.userName === "string" &&
    e.userName.length <= MAX_NAME_LENGTH &&
    typeof e.songTitle === "string" &&
    e.songTitle.length > 0 &&
    e.songTitle.length <= MAX_TITLE_LENGTH &&
    typeof e.videoId === "string" &&
    VIDEO_ID_RE.test(e.videoId)
  );
}

function hasValidSongShape(e: Record<string, unknown>): boolean {
  return (
    isValidSongDuration(e.durationSeconds) &&
    typeof e.id === "string" &&
    e.id.length > 0 &&
    e.id.length <= MAX_ENTRY_ID_LENGTH &&
    typeof e.songTitle === "string" &&
    e.songTitle.length > 0 &&
    e.songTitle.length <= MAX_TITLE_LENGTH &&
    typeof e.videoId === "string" &&
    VIDEO_ID_RE.test(e.videoId)
  );
}

export function isValidSingWithMePost(post: unknown): post is SingWithMePost {
  if (!post || typeof post !== "object") return false;
  const e = post as Record<string, unknown>;
  if (!hasValidSongShape(e)) return false;
  if (typeof e.anonymous !== "boolean") return false;
  if (typeof e.createdBy !== "string" || e.createdBy.length > MAX_NAME_LENGTH) return false;
  if (
    typeof e.minSingers !== "number" ||
    !Number.isInteger(e.minSingers) ||
    e.minSingers < 2 ||
    e.minSingers > MAX_SINGERS
  ) {
    return false;
  }
  if (
    typeof e.maxSingers !== "number" ||
    !Number.isInteger(e.maxSingers) ||
    e.maxSingers < e.minSingers ||
    e.maxSingers > MAX_SINGERS
  ) {
    return false;
  }
  return true;
}

export function isValidSuggestedSong(song: unknown): song is SuggestedSong {
  if (!song || typeof song !== "object") return false;
  const e = song as Record<string, unknown>;
  if (!hasValidSongShape(e)) return false;
  if (typeof e.anonymous !== "boolean") return false;
  if (typeof e.suggestedBy !== "string" || e.suggestedBy.length > MAX_NAME_LENGTH) return false;
  return true;
}

const QR_SIZES = new Set(["large", "normal", "small", "hidden"]);
const DISPLAY_THEMES = new Set<string>(DISPLAY_THEME_LIST);
const SIDEBAR_POSITIONS = new Set(["left", "right"]);
const SIDEBAR_SECTIONS = new Set(["qr", "banner", "upNext", "boards"]);
// Drag-handle bounds for the resizable display sections. Sidebars clamp what they render, so a
// stored size bigger than the current sidebar just fills it edge to edge.
export const QR_PX_MIN = 48;
export const QR_PX_MAX = 300;
export const SIDEBAR_WIDTH_MIN = 220;
export const SIDEBAR_WIDTH_MAX = 460;
export const UP_NEXT_COUNT_MAX = 20;
// Per-surface now-playing height bounds: a TV stage bar and the host transport row don't share a sensible range.
export const DISPLAY_NOW_H_MIN = 100;
export const DISPLAY_NOW_H_MAX = 420;
export const HOST_NOW_H_MIN = 64;
export const HOST_NOW_H_MAX = 260;
export const BANNER_PX_MIN = 14;
export const BANNER_PX_MAX = 64;
const DISPLAY_CONFIG_KEYS = new Set([
  "qrSize",
  "qrPx",
  "showUpNext",
  "upNextCount",
  "showNowPlaying",
  "theme",
  "sidebarPosition",
  "sidebarWidth",
  "sidebarOrder",
  "bannerLine",
  "bannerPx",
  "nowPlayingHeight",
]);

function isIntInRange(value: unknown, min: number, max: number): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

export function isValidDisplayConfig(value: unknown): value is DisplayConfig {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  if (Object.keys(e).some((k) => !DISPLAY_CONFIG_KEYS.has(k))) return false;
  return (
    typeof e.qrSize === "string" &&
    QR_SIZES.has(e.qrSize) &&
    typeof e.showUpNext === "boolean" &&
    // Retired: the up-next list now fills the sidebar. Still tolerated so displays
    // on an older bundle can keep saving; normalizeDisplayConfig strips it.
    (e.upNextCount === undefined ||
      isIntInRange(e.upNextCount, 1, UP_NEXT_COUNT_MAX)) &&
    typeof e.showNowPlaying === "boolean" &&
    typeof e.theme === "string" &&
    DISPLAY_THEMES.has(e.theme) &&
    // Drag-era fields are absent on configs saved by older clients; readers default them.
    (e.qrPx === undefined || isIntInRange(e.qrPx, QR_PX_MIN, QR_PX_MAX)) &&
    (e.sidebarPosition === undefined ||
      (typeof e.sidebarPosition === "string" && SIDEBAR_POSITIONS.has(e.sidebarPosition))) &&
    (e.sidebarWidth === undefined ||
      isIntInRange(e.sidebarWidth, SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX)) &&
    (e.sidebarOrder === undefined || isValidSidebarOrder(e.sidebarOrder)) &&
    (e.nowPlayingHeight === undefined ||
      isIntInRange(e.nowPlayingHeight, DISPLAY_NOW_H_MIN, DISPLAY_NOW_H_MAX)) &&
    // Required: clients old enough to omit it also send the retired welcomeLine, which the unknown-key check already rejects.
    typeof e.bannerLine === "string" &&
    e.bannerLine.length <= MAX_BANNER_LENGTH &&
    (e.bannerPx === undefined ||
      isIntInRange(e.bannerPx, BANNER_PX_MIN, BANNER_PX_MAX))
  );
}

/** Every section exactly once — a partial order would silently drop sections. */
function isValidSidebarOrder(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === SIDEBAR_SECTIONS.size &&
    new Set(value).size === value.length &&
    value.every((s) => typeof s === "string" && SIDEBAR_SECTIONS.has(s))
  );
}

const HOST_SECTIONS = new Set(["queue", "boards", "qr", "banner"]);
const HOST_CONFIG_KEYS = new Set([
  "theme",
  "sidebarPosition",
  "sidebarWidth",
  "showBoards",
  "showQr",
  "showQueue",
  "showTransport",
  "qrPx",
  "nowPlayingHeight",
  "bannerLine",
  "bannerPx",
  "sectionOrder",
]);

/** Every host section exactly once — same contract as isValidSidebarOrder. */
function isValidHostSectionOrder(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === HOST_SECTIONS.size &&
    new Set(value).size === value.length &&
    value.every((s) => typeof s === "string" && HOST_SECTIONS.has(s))
  );
}

export function isValidHostConfig(value: unknown): value is HostConfig {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  if (Object.keys(e).some((k) => !HOST_CONFIG_KEYS.has(k))) return false;
  return (
    typeof e.theme === "string" &&
    DISPLAY_THEMES.has(e.theme) &&
    typeof e.sidebarPosition === "string" &&
    SIDEBAR_POSITIONS.has(e.sidebarPosition) &&
    isIntInRange(e.sidebarWidth, SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX) &&
    typeof e.showBoards === "boolean" &&
    typeof e.showQr === "boolean" &&
    // Absent on configs saved before the queue and transport became hideable;
    // normalizeHostConfig defaults them.
    (e.showQueue === undefined || typeof e.showQueue === "boolean") &&
    (e.showTransport === undefined || typeof e.showTransport === "boolean") &&
    isIntInRange(e.qrPx, QR_PX_MIN, QR_PX_MAX) &&
    // Absent on configs saved before the bar became resizable; normalizeHostConfig defaults it.
    (e.nowPlayingHeight === undefined ||
      isIntInRange(e.nowPlayingHeight, HOST_NOW_H_MIN, HOST_NOW_H_MAX)) &&
    (e.bannerLine === undefined ||
      (typeof e.bannerLine === "string" &&
        e.bannerLine.length <= MAX_BANNER_LENGTH)) &&
    (e.bannerPx === undefined ||
      isIntInRange(e.bannerPx, BANNER_PX_MIN, BANNER_PX_MAX)) &&
    isValidHostSectionOrder(e.sectionOrder)
  );
}

// In-memory, per serverless instance: the effective global limit is (limit × warm instances).
// Abuse protection, not fairness.
const buckets = new Map<string, { count: number; resetAt: number }>();
const MAX_BUCKETS = 10000;

export function rateLimit(
  req: NextApiRequest,
  scope: string,
  limit: number,
  windowMs: number
): boolean {
  const forwarded = req.headers["x-forwarded-for"];
  const ip =
    (typeof forwarded === "string" ? forwarded.split(",")[0].trim() : null) ||
    req.socket?.remoteAddress ||
    "unknown";
  const key = `${scope}:${ip}`;
  const now = Date.now();

  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    if (buckets.size >= MAX_BUCKETS) {
      // Never clear the whole map — that would unthrottle the abuser too. Evict expired buckets
      // first, then the oldest live one (Map iterates in insertion order).
      const expired: string[] = [];
      buckets.forEach((b, k) => {
        if (b.resetAt <= now) expired.push(k);
      });
      expired.forEach((k) => buckets.delete(k));
      if (buckets.size >= MAX_BUCKETS) {
        const oldest = buckets.keys().next().value;
        if (oldest !== undefined) buckets.delete(oldest);
      }
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count++;
  return true;
}
