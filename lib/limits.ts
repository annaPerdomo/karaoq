import type { NextApiRequest } from "next";
import type { DisplayConfig, HostConfig, QueueEntry, SingWithMePost, SuggestedSong } from "../pages/api/types";
import { DISPLAY_THEMES as DISPLAY_THEME_LIST } from "../pages/api/types";

// Server-side caps on anonymous writes. The UI enforces friendlier limits
// (30-char name input, 8 search results); these exist so curl can't balloon
// a room document or fill the database — Atlas free tier is 512MB.
export const MAX_QUEUE_LENGTH = 200;
export const MAX_NAME_LENGTH = 30;
export const MAX_TITLE_LENGTH = 200;
export const MAX_ENTRY_ID_LENGTH = 64;
// Caps on the two social boards, kept small so a room document stays lean.
export const MAX_SING_WITH_ME = 30;
export const MAX_SUGGESTIONS = 50;
// Sanity bound on singer counts for a "Sing with me" post ("One Day More" et al).
export const MAX_SINGERS = 20;
export const MAX_WELCOME_LENGTH = 80;

// YouTube video IDs are exactly 11 URL-safe base64 characters.
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function isValidQueueEntry(entry: unknown): entry is QueueEntry {
  if (!entry || typeof entry !== "object") return false;
  const e = entry as Record<string, unknown>;
  return (
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

/** Shared song-shape checks for the two boards (id + title + videoId). */
function hasValidSongShape(e: Record<string, unknown>): boolean {
  return (
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
const SIDEBAR_SECTIONS = new Set(["qr", "welcome", "upNext", "boards"]);
// Drag-handle bounds for the freely-resizable display sections.
export const QR_PX_MIN = 48;
export const QR_PX_MAX = 140;
export const SIDEBAR_WIDTH_MIN = 220;
export const SIDEBAR_WIDTH_MAX = 460;
export const UP_NEXT_COUNT_MAX = 20;
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
  "welcomeLine",
  "attractMode",
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
    isIntInRange(e.upNextCount, 1, UP_NEXT_COUNT_MAX) &&
    typeof e.showNowPlaying === "boolean" &&
    typeof e.theme === "string" &&
    DISPLAY_THEMES.has(e.theme) &&
    // The drag-era fields are absent on configs saved by older clients;
    // readers (and the write endpoint) default them.
    (e.qrPx === undefined || isIntInRange(e.qrPx, QR_PX_MIN, QR_PX_MAX)) &&
    (e.sidebarPosition === undefined ||
      (typeof e.sidebarPosition === "string" && SIDEBAR_POSITIONS.has(e.sidebarPosition))) &&
    (e.sidebarWidth === undefined ||
      isIntInRange(e.sidebarWidth, SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX)) &&
    (e.sidebarOrder === undefined || isValidSidebarOrder(e.sidebarOrder)) &&
    typeof e.welcomeLine === "string" &&
    e.welcomeLine.length <= MAX_WELCOME_LENGTH &&
    typeof e.attractMode === "boolean"
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

const HOST_SECTIONS = new Set(["queue", "boards", "qr"]);
const HOST_CONFIG_KEYS = new Set([
  "theme",
  "sidebarPosition",
  "sidebarWidth",
  "showHistory",
  "showBoards",
  "showQr",
  "qrPx",
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
    typeof e.showHistory === "boolean" &&
    typeof e.showBoards === "boolean" &&
    typeof e.showQr === "boolean" &&
    isIntInRange(e.qrPx, QR_PX_MIN, QR_PX_MAX) &&
    isValidHostSectionOrder(e.sectionOrder)
  );
}

// Minimal in-memory rate limiter. Per serverless instance, so the effective
// global limit is (limit × warm instances) — imprecise, but it's abuse
// protection, not fairness: it stops a single client from creating thousands
// of rooms or queue entries per minute without adding Redis.
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
      // Never clear the whole map — that would unthrottle everyone,
      // including the abuser whose flood caused the overflow. Evict expired
      // buckets first; if the map is somehow full of live ones, drop the
      // oldest (Map iterates in insertion order).
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
