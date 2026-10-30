// Pure post-processing for GET /api/analytics/screens. The route runs one
// projection pass per section; everything that needs the raw values (medians,
// distinct days per room, zero-filled days, the feedback filter) happens here
// so it can be tested on seeded events without a database.

import type {
  BrandSurface,
  LogoRejectReason,
  ResolveSource,
  ScreensFeedbackEntry,
  ScreensStats,
} from "../components/admin/screens/types";

const DAY_MS = 24 * 60 * 60 * 1000;
export const FEEDBACK_MAX = 20;

export const MUSIC_VIDEO_EVENTS = [
  "original_video_resolved",
  "music_video_screen_opened",
  "music_video_screen_closed",
  "music_video_error",
  "music_video_offset",
  "music_video_link",
] as const;

export const BRAND_EVENTS = ["brand_saved", "logo_uploaded", "logo_upload_rejected"] as const;

export interface MusicVideoRow {
  type: string;
  roomId?: string;
  timestamp: Date | string;
  source?: string;
  durationSeconds?: number;
  songsShown?: number;
  songsUnavailable?: number;
  code?: number;
  offsetSeconds?: number;
  action?: string;
}

export interface BrandRow {
  type: string;
  roomId?: string;
  logo?: boolean;
  colors?: boolean;
  cleared?: boolean;
  surface?: string;
  reason?: string;
}

export interface FeedbackRow {
  _id: unknown;
  createdAt: Date | string;
  kind: string;
  message: string;
  page?: string;
  roomId?: string;
}

function utcDay(at: Date | string | number): string {
  return new Date(at).toISOString().slice(0, 10);
}

/** UTC midnight that opens a window of `days` calendar days ending today. */
export function windowStart(days: number, now: number): Date {
  const today = Date.parse(`${utcDay(now)}T00:00:00.000Z`);
  return new Date(today - (days - 1) * DAY_MS);
}

/** Oldest first, today last. */
export function windowDays(days: number, now: number): string[] {
  const start = windowStart(days, now).getTime();
  const out: string[] = [];
  for (let i = 0; i < days; i++) out.push(utcDay(start + i * DAY_MS));
  return out;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return round1(value);
}

function isNum(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function summarizeMusicVideo(
  rows: MusicVideoRow[],
  days: string[]
): ScreensStats["musicVideo"] {
  const resolve: Record<ResolveSource, number> = { cache: 0, live: 0, quota: 0, busy: 0, none: 0 };
  const errors = new Map<number, number>();
  const daysByRoom = new Map<string, Set<string>>();
  const roomsByDay = new Map<string, Set<string>>(days.map((d) => [d, new Set()]));
  const minutesOpen: number[] = [];
  const absOffsets: number[] = [];
  const links = { open: 0, copy: 0 };
  let opens = 0;
  let songsShown = 0;
  let songsUnavailable = 0;

  for (const row of rows) {
    switch (row.type) {
      case "original_video_resolved":
        if (row.source && Object.prototype.hasOwnProperty.call(resolve, row.source)) {
          resolve[row.source as ResolveSource] += 1;
        }
        break;
      case "music_video_screen_opened": {
        opens += 1;
        if (!row.roomId) break;
        const day = utcDay(row.timestamp);
        const seen = daysByRoom.get(row.roomId) ?? new Set<string>();
        seen.add(day);
        daysByRoom.set(row.roomId, seen);
        roomsByDay.get(day)?.add(row.roomId);
        break;
      }
      case "music_video_screen_closed":
        if (isNum(row.durationSeconds)) minutesOpen.push(row.durationSeconds / 60);
        if (isNum(row.songsShown)) songsShown += row.songsShown;
        if (isNum(row.songsUnavailable)) songsUnavailable += row.songsUnavailable;
        break;
      case "music_video_error":
        if (isNum(row.code)) errors.set(row.code, (errors.get(row.code) ?? 0) + 1);
        break;
      case "music_video_offset":
        if (isNum(row.offsetSeconds)) absOffsets.push(Math.abs(row.offsetSeconds));
        break;
      case "music_video_link":
        if (row.action === "open" || row.action === "copy") links[row.action] += 1;
        break;
    }
  }

  let repeatRooms = 0;
  daysByRoom.forEach((seen) => {
    if (seen.size >= 2) repeatRooms += 1;
  });

  return {
    rooms: daysByRoom.size,
    opens,
    repeatRooms,
    medianMinutesOpen: median(minutesOpen),
    songsShown,
    songsUnavailable,
    resolve,
    errors: Array.from(errors.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count || a.code - b.code),
    songsNudged: absOffsets.length,
    medianAbsOffset: median(absOffsets),
    links,
    daily: days.map((day) => ({ day, rooms: roomsByDay.get(day)!.size })),
  };
}

export function summarizeBrand(
  rows: BrandRow[],
  storage: { storageBytes: number; storageBudgetBytes: number; committedLogos: number }
): ScreensStats["brand"] {
  const logoRooms = new Set<string>();
  const colorRooms = new Set<string>();
  const saves: Record<BrandSurface, number> = { host: 0, display: 0 };
  const rejected: Record<LogoRejectReason, number> = { type: 0, size: 0, storage_full: 0 };
  let clears = 0;
  let uploads = 0;

  for (const row of rows) {
    if (row.type === "brand_saved") {
      if (row.surface === "host" || row.surface === "display") saves[row.surface] += 1;
      if (row.cleared) clears += 1;
      if (row.roomId && row.logo) logoRooms.add(row.roomId);
      if (row.roomId && row.colors) colorRooms.add(row.roomId);
    } else if (row.type === "logo_uploaded") {
      uploads += 1;
    } else if (row.type === "logo_upload_rejected") {
      // From the logo route and from client validation; a client rejection never reaches the route.
      if (row.reason && Object.prototype.hasOwnProperty.call(rejected, row.reason)) {
        rejected[row.reason as LogoRejectReason] += 1;
      }
    }
  }

  return {
    roomsWithLogo: logoRooms.size,
    roomsWithColors: colorRooms.size,
    saves,
    clears,
    uploads,
    rejected,
    ...storage,
  };
}

export function featureRooms(rows: { roomId?: string }[]): Set<string> {
  const rooms = new Set<string>();
  for (const row of rows) if (row.roomId) rooms.add(row.roomId);
  return rooms;
}

export function pickFeatureFeedback(
  entries: FeedbackRow[],
  rooms: Set<string>,
  max = FEEDBACK_MAX
): ScreensFeedbackEntry[] {
  return entries
    .filter(
      (e) =>
        (typeof e.page === "string" && /\/video$/.test(e.page)) ||
        (!!e.roomId && rooms.has(e.roomId.toUpperCase()))
    )
    .map((e) => ({ entry: e, at: new Date(e.createdAt) }))
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, max)
    .map(({ entry, at }) => ({
      id: String(entry._id),
      createdAt: at.toISOString(),
      kind: entry.kind,
      message: entry.message,
      ...(entry.page ? { page: entry.page } : {}),
    }));
}
