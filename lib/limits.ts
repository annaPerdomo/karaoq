import type { NextApiRequest } from "next";
import type { QueueEntry } from "../pages/api/types";

// Server-side caps on anonymous writes. The UI enforces friendlier limits
// (30-char name input, 8 search results); these exist so curl can't balloon
// a room document or fill the database — Atlas free tier is 512MB.
export const MAX_QUEUE_LENGTH = 200;
export const MAX_NAME_LENGTH = 30;
export const MAX_TITLE_LENGTH = 200;
export const MAX_ENTRY_ID_LENGTH = 64;

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
    if (buckets.size >= MAX_BUCKETS) buckets.clear();
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count++;
  return true;
}
