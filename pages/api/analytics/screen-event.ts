import { NextApiRequest, NextApiResponse } from "next";
import { EventType, SCREEN_EVENT_TTL_MS, trackEvent } from "../../../lib/analytics";
import { rateLimit } from "../../../lib/limits";
import { normalizeRoomId, ROOM_CODE_PATTERN } from "../../../lib/roomCode";

// Client-only moments with nothing else to call: the music-video screen never
// writes room state, so this is its one whitelisted way to reach trackEvent.
// Shapes are exact — unknown keys and out-of-range values both 400, same as
// the room-state endpoints.
const MAX_SECONDS = 24 * 60 * 60;
const MAX_SONGS = 1000;
// Matches the host's ±600s nudge range (original-video.ts); the screen adds its own on top.
const MAX_OFFSET_S = 600;
const MAX_ERROR_CODE = 999;

type Extractor = (data: unknown) => Record<string, unknown> | null;

function isInt(value: unknown, min: number, max: number): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function isNumInRange(value: unknown, min: number, max: number): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function hasOnlyKeys(data: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(data).every((k) => keys.includes(k));
}

// Object.create(null): no inherited Object.prototype entries ("constructor",
// "toString", …) for a hasOwnProperty check on an attacker-supplied `type` to find.
const EXTRACTORS: Record<string, Extractor> = Object.create(null);

EXTRACTORS.music_video_screen_opened = (data) => {
  if (!data || typeof data !== "object" || Object.keys(data).length > 0) return null;
  return {};
};

EXTRACTORS.music_video_screen_closed = (data) => {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (!hasOnlyKeys(d, ["durationSeconds", "songsShown", "songsUnavailable"])) return null;
  if (
    !isInt(d.durationSeconds, 0, MAX_SECONDS) ||
    !isInt(d.songsShown, 0, MAX_SONGS) ||
    !isInt(d.songsUnavailable, 0, MAX_SONGS)
  ) {
    return null;
  }
  return {
    durationSeconds: d.durationSeconds,
    songsShown: d.songsShown,
    songsUnavailable: d.songsUnavailable,
  };
};

EXTRACTORS.music_video_error = (data) => {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  // Any plausible IFrame API error code, not a fixed whitelist — YouTube adds
  // new ones occasionally and they should still be counted.
  if (!hasOnlyKeys(d, ["code"]) || !isInt(d.code, 0, MAX_ERROR_CODE)) return null;
  return { code: d.code };
};

EXTRACTORS.music_video_offset = (data) => {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (!hasOnlyKeys(d, ["offsetSeconds"]) || !isNumInRange(d.offsetSeconds, -MAX_OFFSET_S, MAX_OFFSET_S)) {
    return null;
  }
  return { offsetSeconds: d.offsetSeconds };
};

EXTRACTORS.music_video_link = (data) => {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (!hasOnlyKeys(d, ["action"]) || (d.action !== "open" && d.action !== "copy")) return null;
  return { action: d.action };
};

EXTRACTORS.karaoke_swap_opened = (data) => {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (!hasOnlyKeys(d, ["live"]) || typeof d.live !== "boolean") return null;
  return { live: d.live };
};

EXTRACTORS.logo_upload_rejected = (data) => {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (!hasOnlyKeys(d, ["reason"]) || (d.reason !== "type" && d.reason !== "size")) return null;
  return { reason: d.reason };
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  let body: { roomId?: string; type?: string; data?: unknown };
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!body || typeof body !== "object") throw new Error();
  } catch {
    res.status(400).json({ code: 400, message: "Invalid JSON body." });
    return;
  }

  const roomId = typeof body.roomId === "string" ? normalizeRoomId(body.roomId) : null;
  if (typeof roomId !== "string" || !ROOM_CODE_PATTERN.test(roomId)) {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  const { type, data } = body;
  if (typeof type !== "string" || !Object.prototype.hasOwnProperty.call(EXTRACTORS, type)) {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }
  const extracted = EXTRACTORS[type](data);
  if (!extracted) {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  if (!rateLimit(req, "screen-event", 30, 60_000)) {
    res.status(429).json({ code: 429, message: "Too many requests, slow down." });
    return;
  }

  // Built from `extracted` + `roomId` only, never the raw `data` — nothing the
  // client sends can override `type`, `roomId` or `timestamp`.
  await trackEvent(req, type as EventType, {
    roomId,
    ...extracted,
    expiresAt: new Date(Date.now() + SCREEN_EVENT_TTL_MS),
  });
  res.status(200).json({ ok: true });
}
