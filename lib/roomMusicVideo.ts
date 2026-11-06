import { MUSIC_VIDEO_EVENTS, type MusicVideoRow } from "./screensStats";

export const ROOM_MUSIC_VIDEO_EVENTS = [...MUSIC_VIDEO_EVENTS, "original_video_nudged"] as const;

export interface RoomMusicVideo {
  lastSeenAt: Date | string | null;
  firstOpenedAt: Date | string | null;
  opens: number;
  /** Only from pagehide closes — a screen powered off never reports. */
  minutesOpen: number | null;
  songsShown: number;
  songsUnavailable: number;
  songsResolved: number;
  songsWithVideo: number;
  songsWaiting: number;
  swaps: number;
  hostNudges: number;
  songsPlayedOffset: number;
  truncated: boolean;
  errors: { code: number; count: number }[];
  links: { open: number; copy: number };
}

function isNum(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** `rows` must be oldest-first: firstOpenedAt takes the first open seen. */
export function summarizeRoomMusicVideo(
  rows: MusicVideoRow[],
  musicVideoAt: Date | string | null | undefined,
  truncated = false
): RoomMusicVideo {
  const errors = new Map<number, number>();
  const links = { open: 0, copy: 0 };
  let firstOpenedAt: Date | string | null = null;
  let opens = 0;
  let closedSeconds: number | null = null;
  let songsShown = 0;
  let songsUnavailable = 0;
  let songsResolved = 0;
  let songsWithVideo = 0;
  let songsWaiting = 0;
  let swaps = 0;
  let hostNudges = 0;
  let songsPlayedOffset = 0;

  for (const row of rows) {
    switch (row.type) {
      case "original_video_resolved":
        if (row.source === "cache" || row.source === "live" || row.source === "none") {
          songsResolved += 1;
          if (row.found) songsWithVideo += 1;
        } else if (row.source === "quota" || row.source === "busy") {
          songsWaiting += 1;
        }
        break;
      case "original_video_swapped":
        swaps += 1;
        break;
      case "original_video_nudged":
        if (isNum(row.offsetSeconds) && row.offsetSeconds !== 0) hostNudges += 1;
        break;
      case "music_video_offset":
        if (isNum(row.offsetSeconds)) songsPlayedOffset += 1;
        break;
      case "music_video_screen_opened":
        opens += 1;
        firstOpenedAt ??= row.timestamp;
        break;
      case "music_video_screen_closed":
        if (isNum(row.durationSeconds)) closedSeconds = (closedSeconds ?? 0) + row.durationSeconds;
        if (isNum(row.songsShown)) songsShown += row.songsShown;
        if (isNum(row.songsUnavailable)) songsUnavailable += row.songsUnavailable;
        break;
      case "music_video_error":
        if (isNum(row.code)) errors.set(row.code, (errors.get(row.code) ?? 0) + 1);
        break;
      case "music_video_link":
        if (row.action === "open" || row.action === "copy") links[row.action] += 1;
        break;
    }
  }

  return {
    lastSeenAt: musicVideoAt ?? null,
    firstOpenedAt,
    opens,
    minutesOpen: closedSeconds === null ? null : Math.round(closedSeconds / 60),
    songsShown,
    songsUnavailable,
    songsResolved,
    songsWithVideo,
    songsWaiting,
    swaps,
    hostNudges,
    songsPlayedOffset,
    truncated,
    errors: Array.from(errors, ([code, count]) => ({ code, count })).sort(
      (a, b) => b.count - a.count || a.code - b.code
    ),
    links,
  };
}
